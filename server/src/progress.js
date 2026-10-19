import fs from 'node:fs';
import { episodeFromRow, showFor } from './library.js';

const CONTINUE_LIMIT = 20;

export function isCompleted(position, duration) {
  // The "last 15 s" rule only makes sense for episodes long enough to have credits.
  return position >= duration * 0.92 || (duration >= 60 && duration - position < 15);
}

export function createProgress({ db }) {
  const raw = db.raw;
  const stmts = {
    download: raw.prepare('SELECT * FROM downloads WHERE id = ?'),
    upsert: raw.prepare(`
      INSERT INTO progress (profileId, downloadId, bookId, episodeIndex, position, duration, completed, updatedAt)
      VALUES (@profileId, @downloadId, @bookId, @episodeIndex, @position, @duration, @completed, @updatedAt)
      ON CONFLICT(profileId, downloadId) DO UPDATE SET
        position = excluded.position,
        duration = excluded.duration,
        completed = excluded.completed,
        updatedAt = excluded.updatedAt`),
    one: raw.prepare('SELECT * FROM progress WHERE profileId = ? AND downloadId = ?'),
    byBook: raw.prepare('SELECT downloadId, position, duration, completed FROM progress WHERE profileId = ? AND bookId = ?'),
    recent: raw.prepare('SELECT * FROM progress WHERE profileId = ? ORDER BY updatedAt DESC'),
    laterEpisodes: raw.prepare(`
      SELECT * FROM downloads
      WHERE bookId = ? AND status = 'completed' AND filePath IS NOT NULL AND episodeIndex > ?
      ORDER BY episodeIndex`),
  };

  const exists = (row) => !!row?.filePath && fs.existsSync(row.filePath);
  const view = (row) => ({ position: row.position, duration: row.duration, completed: !!row.completed });

  return {
    save(profileId, download, { position, duration }) {
      const completed = isCompleted(position, duration) ? 1 : 0;
      stmts.upsert.run({
        profileId,
        downloadId: download.id,
        bookId: download.bookId,
        episodeIndex: download.episodeIndex,
        position,
        duration,
        completed,
        updatedAt: Date.now(),
      });
      return { position, duration, completed: !!completed };
    },

    forEpisode(profileId, downloadId) {
      const row = stmts.one.get(profileId, downloadId);
      return row ? view(row) : null;
    },

    forBook(profileId, bookId) {
      return new Map(stmts.byBook.all(profileId, bookId).map((r) => [r.downloadId, view(r)]));
    },

    continueWatching(profileId) {
      const items = [];
      const seen = new Set();
      for (const p of stmts.recent.all(profileId)) {
        if (seen.has(p.bookId)) continue;
        seen.add(p.bookId);

        const download = stmts.download.get(p.downloadId);
        if (!exists(download)) continue;
        const show = showFor(db, p.bookId, download.showName);

        if (!p.completed) {
          items.push({ show, episode: episodeFromRow(download, view(p)), position: p.position, duration: p.duration });
          continue;
        }
        const next = stmts.laterEpisodes.all(p.bookId, download.episodeIndex).find(exists);
        if (next) items.push({ show, episode: episodeFromRow(next, null), position: 0, duration: 0 });
      }
      return items.slice(0, CONTINUE_LIMIT);
    },
  };
}
