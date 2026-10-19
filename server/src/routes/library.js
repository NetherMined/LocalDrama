import fs from 'node:fs';
import { httpError } from '../errors.js';
import { sendRanged } from '../stream.js';
import { episodeFromRow, showFor } from '../library.js';

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid episode id');
  return id;
}

export function registerLibraryRoutes(app, ctx) {
  const { db, library, profiles, progress } = ctx;
  const raw = db.raw;

  const completedRows = (bookId) => {
    const rows = bookId === undefined
      ? raw.prepare("SELECT * FROM downloads WHERE status = 'completed' ORDER BY episodeIndex").all()
      : raw.prepare("SELECT * FROM downloads WHERE status = 'completed' AND bookId = ? ORDER BY episodeIndex").all(bookId);
    return rows.filter((r) => r.filePath && fs.existsSync(r.filePath));
  };

  app.get('/api/library', async () => {
    const groups = new Map();
    for (const row of completedRows()) {
      const g = groups.get(row.bookId) ?? { row, downloaded: 0 };
      g.downloaded += 1;
      groups.set(row.bookId, g);
    }
    const shows = [...groups.entries()]
      .map(([bookId, g]) => ({ ...showFor(db, bookId, g.row.showName), downloaded: g.downloaded }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { shows };
  });

  app.post('/api/library/scan', async (req) => {
    profiles.requireAdmin(req);
    return library.scan();
  });

  app.get('/api/library/poster/:bookId', async (req, reply) => {
    const file = library.posterFor(String(req.params.bookId));
    if (!file) throw httpError(404, 'Poster not found');
    reply.type('image/jpeg');
    return reply.send(fs.createReadStream(file));
  });

  app.delete('/api/library/episodes/:id', async (req) => {
    profiles.requireAdmin(req);
    return library.deleteEpisode(parseId(req.params.id));
  });

  app.get('/api/library/:bookId', async (req) => {
    const bookId = String(req.params.bookId);
    const rows = completedRows(bookId);
    if (!rows.length) throw httpError(404, 'Show not found in library');
    const profile = profiles.current(req);
    const progressById = profile ? progress.forBook(profile.id, bookId) : new Map();
    const episodes = rows.map((r) => episodeFromRow(r, progressById.get(r.id) ?? null));
    return { show: showFor(db, bookId, rows[0].showName), episodes };
  });

  app.get('/media/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) ? raw.prepare('SELECT * FROM downloads WHERE id = ?').get(id) : undefined;
    if (!row || row.status !== 'completed' || !row.filePath) throw httpError(404, 'Media not found');
    return sendRanged(req, reply, row.filePath);
  });
}
