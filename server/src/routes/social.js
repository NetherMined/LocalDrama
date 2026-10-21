import { httpError } from '../errors.js';

function bookIdParam(req) {
  const bookId = String(req.params.bookId || '');
  if (!bookId || bookId.length > 64) throw httpError(400, 'Invalid book id');
  return bookId;
}

function optionalText(value, max = 64) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (text.length > max) throw httpError(400, 'Invalid source');
  return text;
}

export function registerSocialRoutes(app, ctx) {
  const { db, provider, follows } = ctx;
  const raw = db.raw;

  const likeCount = raw.prepare('SELECT COUNT(*) AS n FROM likes WHERE bookId = ?');
  const isLiked = raw.prepare('SELECT 1 FROM likes WHERE accountId = ? AND bookId = ?');
  const putLike = raw.prepare('INSERT OR IGNORE INTO likes (accountId, bookId, createdAt) VALUES (?, ?, ?)');
  const delLike = raw.prepare('DELETE FROM likes WHERE accountId = ? AND bookId = ?');
  const isFollowing = raw.prepare('SELECT 1 FROM follows WHERE accountId = ? AND bookId = ?');
  const putFollow = raw.prepare(`
    INSERT OR IGNORE INTO follows (accountId, bookId, sourceId, knownEpisodes, createdAt, checkedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const delFollow = raw.prepare('DELETE FROM follows WHERE accountId = ? AND bookId = ?');

  function socialFor(accountId, bookId) {
    return {
      likes: likeCount.get(bookId).n,
      liked: !!isLiked.get(accountId, bookId),
      following: !!isFollowing.get(accountId, bookId),
    };
  }

  app.get('/api/shows/:bookId/social', async (req) => socialFor(req.account.id, bookIdParam(req)));

  app.put('/api/shows/:bookId/like', async (req) => {
    const bookId = bookIdParam(req);
    putLike.run(req.account.id, bookId, new Date().toISOString());
    return socialFor(req.account.id, bookId);
  });

  app.delete('/api/shows/:bookId/like', async (req) => {
    const bookId = bookIdParam(req);
    delLike.run(req.account.id, bookId);
    return socialFor(req.account.id, bookId);
  });

  app.put('/api/shows/:bookId/follow', async (req) => {
    const bookId = bookIdParam(req);
    const accountId = req.account.id;
    const show = db.getShow(bookId);
    const sourceId = optionalText(req.body?.source) ?? show?.source ?? null;
    const now = new Date().toISOString();
    let known = 0;
    try {
      const { chapters } = await provider.chapters(bookId, { sourceId: sourceId || undefined });
      known = chapters?.length ?? 0;
    } catch {
      known = 0;
    }
    if (!known) known = show?.episodeCount ?? 0;
    putFollow.run(accountId, bookId, sourceId, known, now, now);
    return socialFor(accountId, bookId);
  });

  app.delete('/api/shows/:bookId/follow', async (req) => {
    const bookId = bookIdParam(req);
    delFollow.run(req.account.id, bookId);
    return socialFor(req.account.id, bookId);
  });
}
