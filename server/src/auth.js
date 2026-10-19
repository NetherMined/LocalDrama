import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'dbx_session';
export const SESSION_MAX_AGE = 2592000;

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

export function createAuth(raw) {
  const insert = raw.prepare('INSERT INTO sessions (token, createdAt) VALUES (?, ?)');
  const find = raw.prepare('SELECT token FROM sessions WHERE token = ?');
  const remove = raw.prepare('DELETE FROM sessions WHERE token = ?');

  const isValid = (token) => !!token && !!find.get(token);

  return {
    create() {
      const token = crypto.randomBytes(32).toString('hex');
      insert.run(token, new Date().toISOString());
      return token;
    },
    isValid,
    destroy(token) {
      if (token) remove.run(token);
    },
    tokenFromRequest(req) {
      return parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';
    },
    isAuthenticated(req) {
      return isValid(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    },
  };
}
