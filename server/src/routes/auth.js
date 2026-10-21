import { httpError } from '../errors.js';
import {
  clearSessionCookie,
  deviceCookie,
  hashPassword,
  newDeviceId,
  readDeviceId,
  sessionCookie,
  verifyPassword,
} from '../auth.js';
import { clearProfileCookie } from '../profiles.js';

const IP_WINDOW_MS = 60 * 1000;
const IP_MAX_ATTEMPTS = 5;
const USER_WINDOW_MS = 15 * 60 * 1000;
const USER_MAX_ATTEMPTS = 10;
const MAX_TRACKED_KEYS = 10000;

export function limiter(windowMs, max) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    if (hits.size > MAX_TRACKED_KEYS) hits.clear();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > max;
  };
}

export function registerAuthRoutes(app, ctx) {
  const { auth, accounts, profiles } = ctx;
  const overIpLimit = limiter(IP_WINDOW_MS, IP_MAX_ATTEMPTS);
  const overUserLimit = limiter(USER_WINDOW_MS, USER_MAX_ATTEMPTS);
  // Checked against when the account can't sign in, so the response time doesn't reveal
  // which usernames exist.
  const dummyHash = hashPassword('dramaus-timing-guard');

  // Used by login. Replaces any previous session in this browser and
  // sets the device cookie when the browser has none yet.
  function signIn(req, reply, accountId) {
    const knownDevice = readDeviceId(req);
    const deviceId = knownDevice ?? newDeviceId();
    auth.destroy(auth.tokenFromRequest(req));
    accounts.touchDevice(accountId, deviceId, req);
    accounts.recordLogin(accountId);
    const token = auth.create(accountId, deviceId);
    const cookies = [sessionCookie(token), clearProfileCookie()];
    if (!knownDevice) cookies.push(deviceCookie(deviceId));
    reply.header('Set-Cookie', cookies);
    return { account: accounts.get(accountId) };
  }

  app.post('/api/auth/login', async (req, reply) => {
    const body = req.body ?? {};
    const password = body.password;
    if (typeof password !== 'string' || !password) throw httpError(400, 'password is required');
    // Until the sign-in page sends a username (Phase 3), a missing username means the admin account.
    const username = typeof body.username === 'string' && body.username.trim() ? body.username.trim() : 'admin';
    if (overIpLimit(req.ip)) throw httpError(429, 'Too many login attempts. Try again in a minute.');
    if (overUserLimit(username.toLowerCase())) throw httpError(429, 'Too many login attempts for this account. Try again later.');

    const account = accounts.findByUsername(username);
    const usable = !!account && !account.disabled && !!account.passwordHash;
    const matches = await verifyPassword(password, usable ? account.passwordHash : await dummyHash);
    const ok = usable && matches;
    if (!ok) throw httpError(401, 'Invalid username or password');
    return signIn(req, reply, account.id);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    auth.destroy(auth.tokenFromRequest(req));
    profiles.signout(req);
    reply.header('Set-Cookie', [clearSessionCookie(), clearProfileCookie()]);
    return { ok: true };
  });
}
