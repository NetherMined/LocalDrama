import crypto from 'node:crypto';
import { hashPassword, toAccount, verifyPassword } from './auth.js';
import { httpError } from './errors.js';
import { PROFILE_COLORS } from './profiles.js';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const ROLES = new Set(['admin', 'user']);
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMP_LENGTH = 12;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const MAX_USER_AGENT = 300;
// Seeded on first start so a fresh server can be signed into; the forced
// password change on first sign-in replaces it.
export const DEFAULT_ADMIN_USERNAME = 'Admin';
export const DEFAULT_ADMIN_PASSWORD = '12345';

export function parseUsername(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!USERNAME_RE.test(name)) throw httpError(400, 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore');
  return name;
}

function parseRole(value) {
  if (!ROLES.has(value)) throw httpError(400, 'role must be admin or user');
  return value;
}

function parseNewPassword(value) {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD || value.length > MAX_PASSWORD) {
    throw httpError(400, `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
  }
  return value;
}

export function tempPassword() {
  let out = '';
  for (let i = 0; i < TEMP_LENGTH; i += 1) out += TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)];
  return out;
}

// Small user-agent parser: enough to tell devices apart in the device list and notices.
export function describeAgent(userAgent = '') {
  const ua = String(userAgent);
  let browser = 'Unknown browser';
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'Unknown OS';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return { browser, os };
}

export function createAccounts(db, { events }) {
  const raw = db.raw;
  const stmts = {
    list: raw.prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM profiles p WHERE p.accountId = a.id) AS profileCount,
        (SELECT COUNT(*) FROM devices d WHERE d.accountId = a.id) AS deviceCount
      FROM accounts a ORDER BY a.id
    `),
    byId: raw.prepare('SELECT * FROM accounts WHERE id = ?'),
    byUsername: raw.prepare('SELECT * FROM accounts WHERE username = ?'),
    firstAdmin: raw.prepare("SELECT * FROM accounts WHERE role = 'admin' ORDER BY id LIMIT 1"),
    enabledAdmins: raw.prepare("SELECT COUNT(*) AS n FROM accounts WHERE role = 'admin' AND disabled = 0"),
    anyPassword: raw.prepare("SELECT COUNT(*) AS n FROM accounts WHERE passwordHash IS NOT NULL AND passwordHash <> ''"),
    insertAccount: raw.prepare(`
      INSERT INTO accounts (username, passwordHash, role, mustChangePassword, disabled, createdAt, createdBy)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `),
    setPassword: raw.prepare('UPDATE accounts SET passwordHash = ?, mustChangePassword = ? WHERE id = ?'),
    setRole: raw.prepare('UPDATE accounts SET role = ? WHERE id = ?'),
    setDisabled: raw.prepare('UPDATE accounts SET disabled = ? WHERE id = ?'),
    setUsername: raw.prepare('UPDATE accounts SET username = ? WHERE id = ?'),
    setLastLogin: raw.prepare('UPDATE accounts SET lastLoginAt = ? WHERE id = ?'),
    deleteAccount: raw.prepare('DELETE FROM accounts WHERE id = ?'),
    profileCount: raw.prepare('SELECT COUNT(*) AS n FROM profiles'),
    profileIds: raw.prepare('SELECT id FROM profiles WHERE accountId = ?'),
    insertProfile: raw.prepare('INSERT INTO profiles (name, color, pinHash, isAdmin, createdAt, accountId) VALUES (?, ?, NULL, 0, ?, ?)'),
    deleteProfile: raw.prepare('DELETE FROM profiles WHERE id = ?'),
    deleteProgress: raw.prepare('DELETE FROM progress WHERE profileId = ?'),
    deleteWatchProgress: raw.prepare('DELETE FROM watch_progress WHERE profileId = ?'),
    deleteWatchDaily: raw.prepare('DELETE FROM watch_daily WHERE profileId = ?'),
    deleteFavourites: raw.prepare('DELETE FROM favourites WHERE profileId = ?'),
    deleteProfileSessions: raw.prepare('DELETE FROM profile_sessions WHERE profileId = ?'),
    deleteAccountSessions: raw.prepare('DELETE FROM sessions WHERE accountId = ?'),
    deleteOtherSessions: raw.prepare('DELETE FROM sessions WHERE accountId = ? AND token <> ?'),
    deleteDeviceSessions: raw.prepare('DELETE FROM sessions WHERE accountId = ? AND deviceId = ?'),
    device: raw.prepare('SELECT * FROM devices WHERE id = ? AND accountId = ?'),
    devices: raw.prepare('SELECT * FROM devices WHERE accountId = ? ORDER BY lastSeenAt DESC'),
    deviceCount: raw.prepare('SELECT COUNT(*) AS n FROM devices WHERE accountId = ?'),
    insertDevice: raw.prepare(`
      INSERT INTO devices (id, accountId, name, userAgent, ip, firstSeenAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateDevice: raw.prepare('UPDATE devices SET name = ?, userAgent = ?, ip = ?, lastSeenAt = ? WHERE id = ? AND accountId = ?'),
    deleteDevice: raw.prepare('DELETE FROM devices WHERE id = ? AND accountId = ?'),
    deleteDevices: raw.prepare('DELETE FROM devices WHERE accountId = ?'),
    insertNotification: raw.prepare('INSERT INTO notifications (accountId, kind, title, body, createdAt, link) VALUES (?, ?, ?, ?, ?, ?)'),
    deleteLikes: raw.prepare('DELETE FROM likes WHERE accountId = ?'),
    deleteFollows: raw.prepare('DELETE FROM follows WHERE accountId = ?'),
    notifications: raw.prepare('SELECT * FROM notifications WHERE accountId = ? ORDER BY id DESC LIMIT ?'),
    unread: raw.prepare('SELECT COUNT(*) AS n FROM notifications WHERE accountId = ? AND readAt IS NULL'),
    markAllRead: raw.prepare('UPDATE notifications SET readAt = ? WHERE accountId = ? AND readAt IS NULL'),
    markOneRead: raw.prepare('UPDATE notifications SET readAt = ? WHERE id = ? AND accountId = ? AND readAt IS NULL'),
    deleteNotifications: raw.prepare('DELETE FROM notifications WHERE accountId = ?'),
  };

  const row = (id) => {
    const found = stmts.byId.get(id);
    if (!found) throw httpError(404, 'Account not found');
    return found;
  };

  const enabledAdminCount = () => stmts.enabledAdmins.get().n;
  const hasPassword = () => stmts.anyPassword.get().n > 0;
  let defaultCredentialsActive = false;
  const clearDefaultFlag = (id) => {
    if (id === stmts.firstAdmin.get()?.id) defaultCredentialsActive = false;
  };

  function assertUsernameFree(username, exceptId) {
    const found = stmts.byUsername.get(username);
    if (found && found.id !== exceptId) throw httpError(409, 'That username is taken');
  }

  function addNotification(accountId, kind, title, body = '', link = null) {
    stmts.insertNotification.run(accountId, kind, title, body, new Date().toISOString(), link);
    events?.emit('notification', { type: 'notification' });
  }

  function assertKeepsAnEnabledAdmin(target) {
    if (target.role === 'admin' && !target.disabled && enabledAdminCount() <= 1) {
      throw httpError(400, 'At least one enabled admin is required');
    }
  }

  return {
    hasPassword,
    needsBootstrap: () => !hasPassword(),
    defaultCredentialsActive: () => defaultCredentialsActive,

    // Gives the first admin the default credentials while no account has a password, and
    // remembers (across restarts) whether they are still in use so sign-in can show them.
    async seedDefaultAdmin() {
      const admin = stmts.firstAdmin.get();
      if (!admin) return;
      if (!hasPassword()) {
        const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
        raw.transaction(() => {
          if (hasPassword()) return;
          assertUsernameFree(DEFAULT_ADMIN_USERNAME, admin.id);
          stmts.setUsername.run(DEFAULT_ADMIN_USERNAME, admin.id);
          stmts.setPassword.run(passwordHash, 1, admin.id);
        })();
      }
      const current = stmts.firstAdmin.get();
      defaultCredentialsActive =
        !!current.mustChangePassword && !!current.passwordHash &&
        (await verifyPassword(DEFAULT_ADMIN_PASSWORD, current.passwordHash));
    },

    list() {
      return stmts.list.all().map((r) => ({
        ...toAccount(r),
        profileCount: r.profileCount,
        deviceCount: r.deviceCount,
      }));
    },

    get(id) {
      return toAccount(row(id));
    },

    findByUsername(username) {
      return stmts.byUsername.get(String(username));
    },

    async create({ username, role, createdBy }) {
      const name = parseUsername(username);
      const roleValue = role === undefined ? 'user' : parseRole(role);
      const temp = tempPassword();
      const passwordHash = await hashPassword(temp);
      const now = new Date().toISOString();
      const id = raw.transaction(() => {
        assertUsernameFree(name);
        const res = stmts.insertAccount.run(name, passwordHash, roleValue, 1, now, createdBy ?? null);
        const accountId = Number(res.lastInsertRowid);
        const color = PROFILE_COLORS[stmts.profileCount.get().n % PROFILE_COLORS.length];
        stmts.insertProfile.run(name, color, now, accountId);
        addNotification(
          accountId,
          'welcome',
          'Welcome to DramaUs',
          "You're signed in with a temporary password. Set your own password on your Account page.",
        );
        return accountId;
      })();
      return { account: toAccount(row(id)), tempPassword: temp };
    },

    // Sets the admin password on first run. Only the first admin, and only while no account has a password.
    async bootstrap({ username, password }) {
      const name = username === undefined ? undefined : parseUsername(username);
      const passwordHash = await hashPassword(parseNewPassword(password));
      return raw.transaction(() => {
        if (hasPassword()) return null;
        const admin = stmts.firstAdmin.get();
        if (!admin) return null;
        if (name !== undefined && name !== admin.username) {
          assertUsernameFree(name, admin.id);
          stmts.setUsername.run(name, admin.id);
        }
        stmts.setPassword.run(passwordHash, 0, admin.id);
        return admin.id;
      })();
    },

    async resetPassword(id, actorId) {
      if (id === actorId) throw httpError(400, 'Use Change password on your Account page to change your own password');
      row(id);
      const temp = tempPassword();
      const passwordHash = await hashPassword(temp);
      raw.transaction(() => {
        stmts.setPassword.run(passwordHash, 1, id);
        stmts.deleteAccountSessions.run(id);
        addNotification(
          id,
          'password_reset',
          'Your password was reset',
          'An admin set a temporary password. Sign in and choose a new one on your Account page.',
        );
      })();
      clearDefaultFlag(id);
      return { tempPassword: temp };
    },

    // Signed-in user changes their own password. Other sessions are signed out; keepToken stays.
    async changePassword(id, { current, next, keepToken }) {
      const account = row(id);
      if (account.passwordHash) {
        if (typeof current !== 'string' || !(await verifyPassword(current, account.passwordHash))) {
          throw httpError(401, 'Current password is incorrect');
        }
      }
      const password = parseNewPassword(next);
      if (typeof current === 'string' && password === current) {
        throw httpError(400, 'The new password must be different from the current one');
      }
      const passwordHash = await hashPassword(password);
      raw.transaction(() => {
        stmts.setPassword.run(passwordHash, 0, id);
        stmts.deleteOtherSessions.run(id, keepToken || '');
      })();
      clearDefaultFlag(id);
      return { ok: true };
    },

    // Admin sets the password from Settings (the caller is already a signed-in admin).
    async setPassword(id, next, keepToken) {
      row(id);
      const passwordHash = await hashPassword(parseNewPassword(next));
      raw.transaction(() => {
        stmts.setPassword.run(passwordHash, 0, id);
        stmts.deleteOtherSessions.run(id, keepToken || '');
      })();
      clearDefaultFlag(id);
      return { ok: true };
    },

    setRole(id, role, actorId) {
      const target = row(id);
      const next = parseRole(role);
      if (next === target.role) return toAccount(target);
      if (target.role === 'admin' && next !== 'admin') {
        if (id === actorId) throw httpError(400, 'You cannot demote your own account');
        assertKeepsAnEnabledAdmin(target);
      }
      stmts.setRole.run(next, id);
      return toAccount(row(id));
    },

    setDisabled(id, disabled, actorId) {
      const target = row(id);
      if (typeof disabled !== 'boolean') throw httpError(400, 'disabled must be true or false');
      if (!!target.disabled === disabled) return toAccount(target);
      if (disabled) {
        if (id === actorId) throw httpError(400, 'You cannot disable your own account');
        assertKeepsAnEnabledAdmin(target);
      }
      raw.transaction(() => {
        stmts.setDisabled.run(disabled ? 1 : 0, id);
        if (disabled) stmts.deleteAccountSessions.run(id);
      })();
      return toAccount(row(id));
    },

    remove(id, actorId) {
      const target = row(id);
      if (id === actorId) throw httpError(400, 'You cannot delete your own account');
      assertKeepsAnEnabledAdmin(target);
      raw.transaction(() => {
        for (const { id: profileId } of stmts.profileIds.all(id)) {
          stmts.deleteProgress.run(profileId);
          stmts.deleteWatchProgress.run(profileId);
          stmts.deleteWatchDaily.run(profileId);
          stmts.deleteFavourites.run(profileId);
          stmts.deleteProfileSessions.run(profileId);
          stmts.deleteProfile.run(profileId);
        }
        stmts.deleteAccountSessions.run(id);
        stmts.deleteDevices.run(id);
        stmts.deleteNotifications.run(id);
        stmts.deleteLikes.run(id);
        stmts.deleteFollows.run(id);
        stmts.deleteAccount.run(id);
      })();
      return { ok: true };
    },

    recordLogin(id) {
      stmts.setLastLogin.run(new Date().toISOString(), id);
    },

    // Records the browser for this account. A device that is new while the account already has
    // other devices raises a "New sign-in" notification.
    touchDevice(accountId, deviceId, req) {
      const userAgent = String(req.headers['user-agent'] || '').slice(0, MAX_USER_AGENT);
      const ip = String(req.ip || '').slice(0, 64);
      const { browser, os } = describeAgent(userAgent);
      const name = `${browser} on ${os}`;
      const now = new Date().toISOString();
      return raw.transaction(() => {
        if (stmts.device.get(deviceId, accountId)) {
          stmts.updateDevice.run(name, userAgent, ip, now, deviceId, accountId);
          return { isNew: false };
        }
        const hadDevices = stmts.deviceCount.get(accountId).n > 0;
        stmts.insertDevice.run(deviceId, accountId, name, userAgent, ip, now, now);
        if (hadDevices) {
          addNotification(accountId, 'new_device', 'New sign-in', `Signed in on ${browser} on ${os} from ${ip}`);
        }
        return { isNew: true };
      })();
    },

    listDevices(accountId, currentDeviceId) {
      return stmts.devices.all(accountId).map((d) => ({
        id: d.id,
        name: d.name,
        userAgent: d.userAgent,
        ip: d.ip,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        current: d.id === currentDeviceId,
      }));
    },

    removeDevice(accountId, deviceId) {
      return raw.transaction(() => {
        stmts.deleteDeviceSessions.run(accountId, deviceId);
        const res = stmts.deleteDevice.run(deviceId, accountId);
        if (!res.changes) throw httpError(404, 'Device not found');
        return { ok: true };
      })();
    },

    listNotifications(accountId, limit = 50) {
      return stmts.notifications.all(accountId, limit).map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        readAt: n.readAt ?? null,
        link: n.link ?? null,
      }));
    },

    notify: addNotification,

    unreadCount(accountId) {
      return stmts.unread.get(accountId).n;
    },

    // ids omitted: mark everything read. ids given: only those notifications of this account.
    markRead(accountId, ids) {
      const now = new Date().toISOString();
      raw.transaction(() => {
        if (ids === undefined) {
          stmts.markAllRead.run(now, accountId);
          return;
        }
        for (const id of ids) stmts.markOneRead.run(now, id, accountId);
      })();
      return { ok: true, unread: stmts.unread.get(accountId).n };
    },
  };
}
