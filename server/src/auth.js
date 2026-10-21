import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'dbx_session';
export const SESSION_MAX_AGE = 2592000;
export const DEVICE_COOKIE = 'dbx_device';
export const DEVICE_MAX_AGE = 400 * 24 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE * 1000;
const LAST_SEEN_INTERVAL_MS = 60 * 1000;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function parseCookies(header) {
  const out = Object.create(null);
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key || key in out) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

export function tokenFromRequest(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';
}

export function readDeviceId(req) {
  const value = parseCookies(req.headers.cookie)[DEVICE_COOKIE];
  return TOKEN_RE.test(value || '') ? value : null;
}

export function newDeviceId() {
  return crypto.randomBytes(32).toString('hex');
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function deviceCookie(deviceId) {
  return `${DEVICE_COOKIE}=${deviceId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DEVICE_MAX_AGE}`;
}

// The only account fields that may leave the server. Never includes passwordHash.
export function toAccount(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tier: row.tier || 'free',
    vipUntil: row.vipUntil ?? null,
    disabled: !!row.disabled,
    mustChangePassword: !!row.mustChangePassword,
    hasPassword: !!row.passwordHash,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt ?? null,
  };
}

export function createAuth(raw) {
  const insert = raw.prepare('INSERT INTO sessions (token, accountId, deviceId, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?)');
  const findSession = raw.prepare('SELECT * FROM sessions WHERE token = ?');
  const findAccount = raw.prepare('SELECT * FROM accounts WHERE id = ?');
  const touch = raw.prepare('UPDATE sessions SET lastSeenAt = ? WHERE token = ?');
  const remove = raw.prepare('DELETE FROM sessions WHERE token = ?');

  function accountFromToken(token) {
    if (!TOKEN_RE.test(token || '')) return null;
    const session = findSession.get(token);
    if (!session) return null;
    const now = Date.now();
    if (now - Date.parse(session.createdAt) > SESSION_MAX_AGE_MS) {
      remove.run(token);
      return null;
    }
    const row = findAccount.get(session.accountId);
    if (!row || row.disabled) return null;
    if (now - Date.parse(session.lastSeenAt || session.createdAt) > LAST_SEEN_INTERVAL_MS) {
      touch.run(new Date(now).toISOString(), token);
    }
    return toAccount(row);
  }

  return {
    create(accountId, deviceId) {
      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date().toISOString();
      insert.run(token, accountId, deviceId, now, now);
      return token;
    },
    accountFromRequest(req) {
      return accountFromToken(tokenFromRequest(req));
    },
    tokenFromRequest,
    destroy(token) {
      if (token) remove.run(token);
    },
  };
}
