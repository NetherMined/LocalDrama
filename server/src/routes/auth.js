import { getConfig } from '../config.js';
import { httpError } from '../errors.js';
import { SESSION_COOKIE, SESSION_MAX_AGE, verifyPassword } from '../auth.js';

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function registerAuthRoutes(app, ctx) {
  const { auth } = ctx;
  const attempts = new Map();

  function overLimit(ip) {
    const now = Date.now();
    const recent = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    attempts.set(ip, recent);
    return recent.length > MAX_ATTEMPTS;
  }

  app.post('/api/auth/login', async (req, reply) => {
    const password = req.body?.password;
    if (typeof password !== 'string') throw httpError(400, 'password is required');
    const { passwordHash } = getConfig();
    if (!passwordHash) throw httpError(400, 'No password is set');
    if (overLimit(req.ip)) throw httpError(429, 'Too many login attempts. Try again in a minute.');
    if (!(await verifyPassword(password, passwordHash))) throw httpError(401, 'Invalid password');

    const token = auth.create();
    reply.header('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    auth.destroy(auth.tokenFromRequest(req));
    reply.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return { ok: true };
  });
}
