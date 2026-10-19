import fs from 'node:fs';
import { httpError } from '../errors.js';

function pageParam(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function registerBrowseRoutes(app, ctx) {
  const { db, provider } = ctx;

  app.get('/api/browse/latest', async (req) => {
    const { items, hasMore } = await provider.latest(pageParam(req.query.page));
    db.upsertShows(items);
    return { items, hasMore };
  });

  app.get('/api/search', async (req) => {
    const q = String(req.query.q || '').trim();
    if (!q) throw httpError(400, 'q is required');
    const { items, hasMore } = await provider.search(q, pageParam(req.query.page));
    db.upsertShows(items);
    return { items, hasMore };
  });

  app.get('/api/search/suggest', async (req) => {
    const q = String(req.query.q || '').trim();
    if (!q) return { items: [] };
    const shows = await provider.suggest(q);
    db.upsertShows(shows);
    return { items: shows.map(({ bookId, name, cover }) => ({ bookId, name, cover })) };
  });

  app.get('/api/shows/:bookId', async (req) => {
    const bookId = String(req.params.bookId);
    const show = db.getShow(bookId);
    const { chapters } = await provider.chapters(bookId);

    const rows = new Map(
      ctx.db.raw.prepare('SELECT * FROM downloads WHERE bookId = ?').all(bookId).map((r) => [r.episodeIndex, r]),
    );

    const episodes = chapters.map((c) => {
      const row = rows.get(c.index);
      return {
        index: c.index,
        chapterId: c.chapterId,
        name: c.name,
        downloaded: !!row && row.status === 'completed' && !!row.filePath && fs.existsSync(row.filePath),
        downloadStatus: row?.status,
      };
    });

    return { show, episodes };
  });
}
