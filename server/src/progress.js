import fs from 'node:fs';
import { httpError } from './errors.js';
import { episodeFromRow, showFor } from './library.js';

const CONTINUE_LIMIT = 20;
const MAX_STREAK_GAP_MS = 10 * 60 * 1000;
const WALL_SLACK_SECONDS = 5;
const MAX_INCREMENT_SECONDS = 120;

export function isCompleted(position, duration) {
  // The "last 15 s" rule only makes sense for episodes long enough to have credits.
  return position >= duration * 0.92 || (duration >= 60 && duration - position < 15);
}

export function parseSeconds(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw httpError(400, `${name} must be a non-negative number`);
  }
  return value;
}

// Watch seconds added by a save: the playhead may only move as fast as the wall clock, so seeks
// and paused tabs add nothing. A gap longer than 10 min (or a first save) counts nothing.
export function accrue(prev, nextPosition, nowMs) {
  if (!prev) return 0;
  const gapMs = nowMs - prev.updatedAt;
  if (gapMs > MAX_STREAK_GAP_MS) return 0;
  const wallSeconds = Math.max(gapMs, 0) / 1000 + WALL_SLACK_SECONDS;
  const advanced = Math.min(Math.max(nextPosition - prev.position, 0), wallSeconds);
  return Math.min(advanced, MAX_INCREMENT_SECONDS);
}

// Local calendar day (server time zone) as YYYY-MM-DD.
export function dayKey(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function createProgress({ db }) {
  const raw = db.raw;
  const stmts = {
    download: raw.prepare('SELECT * FROM downloads WHERE id = ?'),
    upsert: raw.prepare(`
      INSERT INTO progress (profileId, downloadId, bookId, episodeIndex, position, duration, completed, watchedSeconds, updatedAt)
      VALUES (@profileId, @downloadId, @bookId, @episodeIndex, @position, @duration, @completed, @watchedSeconds, @updatedAt)
      ON CONFLICT(profileId, downloadId) DO UPDATE SET
        position = excluded.position,
        duration = excluded.duration,
        completed = excluded.completed,
        watchedSeconds = excluded.watchedSeconds,
        updatedAt = excluded.updatedAt`),
    one: raw.prepare('SELECT * FROM progress WHERE profileId = ? AND downloadId = ?'),
    byBook: raw.prepare('SELECT downloadId, position, duration, completed FROM progress WHERE profileId = ? AND bookId = ?'),
    recent: raw.prepare('SELECT * FROM progress WHERE profileId = ? ORDER BY updatedAt DESC'),
    laterEpisodes: raw.prepare(`
      SELECT * FROM downloads
      WHERE bookId = ? AND status = 'completed' AND filePath IS NOT NULL AND episodeIndex > ?
      ORDER BY episodeIndex`),
    streamOne: raw.prepare('SELECT * FROM watch_progress WHERE profileId = ? AND bookId = ? AND episodeIndex = ?'),
    streamUpsert: raw.prepare(`
      INSERT INTO watch_progress (profileId, bookId, episodeIndex, sourceId, position, duration, completed, watchedSeconds, updatedAt)
      VALUES (@profileId, @bookId, @episodeIndex, @sourceId, @position, @duration, @completed, @watchedSeconds, @updatedAt)
      ON CONFLICT(profileId, bookId, episodeIndex) DO UPDATE SET
        sourceId = excluded.sourceId,
        position = excluded.position,
        duration = excluded.duration,
        completed = excluded.completed,
        watchedSeconds = excluded.watchedSeconds,
        updatedAt = excluded.updatedAt`),
    streamByBook: raw.prepare('SELECT episodeIndex, position, duration, completed FROM watch_progress WHERE profileId = ? AND bookId = ? ORDER BY episodeIndex'),
    streamRecent: raw.prepare('SELECT * FROM watch_progress WHERE profileId = ? ORDER BY updatedAt DESC'),
    daily: raw.prepare(`
      INSERT INTO watch_daily (profileId, day, seconds) VALUES (?, ?, ?)
      ON CONFLICT(profileId, day) DO UPDATE SET seconds = seconds + excluded.seconds`),
  };

  const exists = (row) => !!row?.filePath && fs.existsSync(row.filePath);
  const view = (row) => ({ position: row.position, duration: row.duration, completed: !!row.completed });
  const addDaily = (profileId, nowMs, seconds) => {
    if (seconds > 0) stmts.daily.run(profileId, dayKey(nowMs), seconds);
  };

  return {
    save(profileId, download, { position, duration }) {
      const now = Date.now();
      const completed = isCompleted(position, duration) ? 1 : 0;
      raw.transaction(() => {
        const prev = stmts.one.get(profileId, download.id);
        const seconds = accrue(prev, position, now);
        stmts.upsert.run({
          profileId,
          downloadId: download.id,
          bookId: download.bookId,
          episodeIndex: download.episodeIndex,
          position,
          duration,
          completed,
          watchedSeconds: (prev?.watchedSeconds || 0) + seconds,
          updatedAt: now,
        });
        addDaily(profileId, now, seconds);
      })();
      return { position, duration, completed: !!completed };
    },

    saveStream(profileId, bookId, episodeIndex, { position, duration, sourceId }) {
      const now = Date.now();
      const completed = isCompleted(position, duration) ? 1 : 0;
      raw.transaction(() => {
        const prev = stmts.streamOne.get(profileId, bookId, episodeIndex);
        const seconds = accrue(prev, position, now);
        stmts.streamUpsert.run({
          profileId,
          bookId,
          episodeIndex,
          sourceId,
          position,
          duration,
          completed,
          watchedSeconds: (prev?.watchedSeconds || 0) + seconds,
          updatedAt: now,
        });
        addDaily(profileId, now, seconds);
      })();
      return { position, duration, completed: !!completed };
    },

    streamItems(profileId, bookId) {
      return stmts.streamByBook.all(profileId, bookId).map((r) => ({
        episodeIndex: r.episodeIndex,
        position: r.position,
        duration: r.duration,
        completed: !!r.completed,
      }));
    },

    // One entry per show, from its most recent stream row. A finished episode offers the next one
    // when the show's known episode count allows it (an unknown count always offers it).
    streamContinue(profileId) {
      const items = [];
      const seen = new Set();
      for (const row of stmts.streamRecent.all(profileId)) {
        if (items.length >= CONTINUE_LIMIT) break;
        if (seen.has(row.bookId)) continue;
        seen.add(row.bookId);

        const show = db.getShow(row.bookId);
        if (!show) continue;
        const source = row.sourceId ?? show.source ?? null;
        if (!row.completed) {
          items.push({ kind: 'stream', show, episodeIndex: row.episodeIndex, position: row.position, duration: row.duration, source, updatedAt: row.updatedAt });
          continue;
        }
        const next = row.episodeIndex + 1;
        if (show.episodeCount > 0 && next >= show.episodeCount) continue;
        items.push({ kind: 'stream', show, episodeIndex: next, position: 0, duration: 0, source, updatedAt: row.updatedAt });
      }
      return items;
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
