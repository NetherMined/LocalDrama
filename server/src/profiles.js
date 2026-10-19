import crypto from 'node:crypto';
import { hashPassword, parseCookies, verifyPassword } from './auth.js';
import { httpError } from './errors.js';

export const PROFILE_COOKIE = 'dbx_profile';
export const PROFILE_MAX_AGE = 2592000;
export const PROFILE_COLORS = ['#e11d48', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const PIN_RE = /^\d{4,6}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const PIN_WINDOW_MS = 60 * 1000;
const PIN_MAX_ATTEMPTS = 5;

export function profileCookie(token) {
  return `${PROFILE_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${PROFILE_MAX_AGE}`;
}

export function clearProfileCookie() {
  return `${PROFILE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function toProfile(row) {
  return { id: row.id, name: row.name, color: row.color, hasPin: !!row.pinHash, isAdmin: !!row.isAdmin };
}

function parseName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 40) throw httpError(400, 'Name must be 1-40 characters');
  return name;
}

function parseColor(value) {
  if (!COLOR_RE.test(String(value))) throw httpError(400, 'color must be a hex color such as #e11d48');
  return String(value).toLowerCase();
}

function parsePin(value) {
  const pin = typeof value === 'number' ? String(value) : value;
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) throw httpError(400, 'PIN must be 4-6 digits');
  return pin;
}

export function createProfiles(db) {
  const raw = db.raw;
  const stmts = {
    all: raw.prepare('SELECT * FROM profiles ORDER BY id'),
    byId: raw.prepare('SELECT * FROM profiles WHERE id = ?'),
    byName: raw.prepare('SELECT id FROM profiles WHERE name = ?'),
    admins: raw.prepare('SELECT COUNT(*) AS n FROM profiles WHERE isAdmin = 1'),
    insert: raw.prepare('INSERT INTO profiles (name, color, pinHash, isAdmin, createdAt) VALUES (?, ?, ?, ?, ?)'),
    update: raw.prepare('UPDATE profiles SET name = ?, color = ?, pinHash = ?, isAdmin = ? WHERE id = ?'),
    remove: raw.prepare('DELETE FROM profiles WHERE id = ?'),
    removeProgress: raw.prepare('DELETE FROM progress WHERE profileId = ?'),
    removeSessions: raw.prepare('DELETE FROM profile_sessions WHERE profileId = ?'),
    session: raw.prepare('SELECT * FROM profile_sessions WHERE token = ?'),
    insertSession: raw.prepare('INSERT INTO profile_sessions (token, profileId, createdAt) VALUES (?, ?, ?)'),
    deleteSession: raw.prepare('DELETE FROM profile_sessions WHERE token = ?'),
  };
  const pinAttempts = new Map();

  const get = (id) => {
    const row = stmts.byId.get(id);
    if (!row) throw httpError(404, 'Profile not found');
    return row;
  };

  const adminCount = () => stmts.admins.get().n;

  function assertUniqueName(name, exceptId) {
    const found = stmts.byName.get(name);
    if (found && found.id !== exceptId) throw httpError(409, 'A profile with this name already exists');
  }

  function current(req) {
    const token = parseCookies(req.headers.cookie)[PROFILE_COOKIE];
    const session = token ? stmts.session.get(token) : undefined;
    if (session) {
      const row = stmts.byId.get(session.profileId);
      if (row) return toProfile(row);
    }
    const all = stmts.all.all();
    if (all.length === 1 && !all[0].pinHash) return toProfile(all[0]);
    return null;
  }

  function requireProfile(req) {
    const profile = current(req);
    if (!profile) throw httpError(403, 'profile_required');
    return profile;
  }

  function requireAdmin(req) {
    const profile = requireProfile(req);
    if (!profile.isAdmin) throw httpError(403, 'admin_required');
    return profile;
  }

  function overPinLimit(id) {
    const now = Date.now();
    const recent = (pinAttempts.get(id) || []).filter((t) => now - t < PIN_WINDOW_MS);
    recent.push(now);
    pinAttempts.set(id, recent);
    return recent.length > PIN_MAX_ATTEMPTS;
  }

  return {
    list() {
      return stmts.all.all().map(toProfile);
    },

    current,
    requireProfile,
    requireAdmin,

    async create(body) {
      const name = parseName(body.name);
      const color = body.color === undefined ? PROFILE_COLORS[stmts.all.all().length % PROFILE_COLORS.length] : parseColor(body.color);
      const pinHash = body.pin ? await hashPassword(parsePin(body.pin)) : null;
      assertUniqueName(name);
      const res = stmts.insert.run(name, color, pinHash, body.isAdmin ? 1 : 0, new Date().toISOString());
      return toProfile(stmts.byId.get(res.lastInsertRowid));
    },

    async update(id, body, actor) {
      const target = get(id);
      const isSelf = actor.id === id;
      if (!actor.isAdmin && !isSelf) throw httpError(403, 'admin_required');

      const wantsAdmin = body.isAdmin === undefined ? !!target.isAdmin : !!body.isAdmin;
      if (wantsAdmin !== !!target.isAdmin && !actor.isAdmin) throw httpError(403, 'admin_required');
      if (target.isAdmin && !wantsAdmin && adminCount() <= 1) {
        throw httpError(400, 'At least one admin profile is required');
      }

      const name = body.name === undefined ? target.name : parseName(body.name);
      if (name !== target.name) assertUniqueName(name, id);
      const color = body.color === undefined ? target.color : parseColor(body.color);
      let pinHash = target.pinHash;
      if (body.pin !== undefined) {
        pinHash = body.pin === '' || body.pin === null ? null : await hashPassword(parsePin(body.pin));
      }

      stmts.update.run(name, color, pinHash, wantsAdmin ? 1 : 0, id);
      return toProfile(get(id));
    },

    remove(id) {
      const target = get(id);
      if (target.isAdmin && adminCount() <= 1) throw httpError(400, 'At least one admin profile is required');
      raw.transaction(() => {
        stmts.removeProgress.run(id);
        stmts.removeSessions.run(id);
        stmts.remove.run(id);
      })();
      return { ok: true };
    },

    async select(id, pin) {
      const target = get(id);
      if (target.pinHash) {
        if (overPinLimit(id)) throw httpError(429, 'Too many attempts. Try again in a minute.');
        const given = typeof pin === 'number' ? String(pin) : typeof pin === 'string' ? pin : '';
        if (!(await verifyPassword(given, target.pinHash))) throw httpError(401, 'invalid_pin');
        pinAttempts.delete(id);
      }
      const token = crypto.randomBytes(32).toString('hex');
      stmts.insertSession.run(token, id, new Date().toISOString());
      return { profile: toProfile(target), token };
    },

    signout(req) {
      const token = parseCookies(req.headers.cookie)[PROFILE_COOKIE];
      if (token) stmts.deleteSession.run(token);
    },
  };
}
