import { httpError } from '../errors.js';
import { parseCookies } from '../auth.js';

export const SHARE_COOKIE = 'dbx_share';
const SHARE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function readShareCode(req) {
  return parseCookies(req.headers.cookie)[SHARE_COOKIE] || '';
}

export function clearShareCookie() {
  return `${SHARE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function showPath(link) {
  const query = link.sourceId ? `?source=${encodeURIComponent(link.sourceId)}` : '';
  return `/show/${encodeURIComponent(link.bookId)}${query}`;
}

export function registerRewardsRoutes(app, ctx) {
  const { rewards, auth } = ctx;

  app.get('/api/rewards', async (req) => rewards.summary(req.account));

  app.post('/api/rewards/daily', async (req) => rewards.claimDaily(req.account));

  app.post('/api/rewards/share', async (req) => {
    const { bookId, source } = req.body ?? {};
    if (!bookId) throw httpError(400, 'bookId is required');
    return rewards.createShare(req.account, String(bookId), source ? String(source) : null);
  });

  app.post('/api/rewards/share/complete', async (req) => {
    const code = String(req.body?.code || '');
    if (!code) throw httpError(400, 'code is required');
    return rewards.completeShare(req.account, code);
  });

  app.post('/api/rewards/shop', async (req) => {
    const { kind, bookId, source, fromEp } = req.body ?? {};
    return rewards.purchase(req.account, { kind, bookId, source: source ? String(source) : undefined, fromEp });
  });

  // Public short link. A signed-in visitor credits the sharer now; otherwise the code waits in a
  // cookie until they sign in (see routes/auth.js).
  app.get('/s/:code', async (req, reply) => {
    const code = String(req.params.code);
    const link = rewards.linkFor(code);
    if (!link) return reply.redirect('/');
    const visitor = auth.accountFromRequest(req);
    if (visitor) rewards.openShare(code, visitor);
    else reply.header('Set-Cookie', `${SHARE_COOKIE}=${code}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SHARE_COOKIE_MAX_AGE}`);
    return reply.redirect(showPath(link));
  });
}
