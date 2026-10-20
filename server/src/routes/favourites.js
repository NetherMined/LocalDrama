import { httpError } from '../errors.js';

export function registerFavouriteRoutes(app, ctx) {
  const { db, profiles } = ctx;
  const raw = db.raw;

  const add = raw.prepare('INSERT OR IGNORE INTO favourites (profileId, bookId, createdAt) VALUES (?, ?, ?)');
  const remove = raw.prepare('DELETE FROM favourites WHERE profileId = ? AND bookId = ?');
  const list = raw.prepare(`
    SELECT s.* FROM favourites f
    JOIN shows s ON s.bookId = f.bookId
    WHERE f.profileId = ?
    ORDER BY f.createdAt DESC
  `);
  const has = raw.prepare('SELECT 1 FROM favourites WHERE profileId = ? AND bookId = ?');

  app.get('/api/favourites', async (req) => {
    const profile = profiles.requireProfile(req);
    const rows = list.all(profile.id);
    return { items: rows.map((r) => ({
      bookId: r.bookId,
      name: r.name,
      cover: r.cover,
      introduction: r.introduction,
      episodeCount: r.episodeCount,
      playCount: r.playCount,
      tags: JSON.parse(r.tags || '[]'),
    })) };
  });

  app.post('/api/favourites/:bookId', async (req) => {
    const profile = profiles.requireProfile(req);
    const bookId = String(req.params.bookId);
    add.run(profile.id, bookId, new Date().toISOString());
    return { ok: true };
  });

  app.delete('/api/favourites/:bookId', async (req) => {
    const profile = profiles.requireProfile(req);
    const bookId = String(req.params.bookId);
    remove.run(profile.id, bookId);
    return { ok: true };
  });

  app.get('/api/favourites/:bookId', async (req) => {
    const profile = profiles.requireProfile(req);
    const bookId = String(req.params.bookId);
    return { favourite: !!has.get(profile.id, bookId) };
  });
}
