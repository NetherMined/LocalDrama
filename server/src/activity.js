import { toAccount } from './auth.js';
import { httpError } from './errors.js';
import { dayKey } from './progress.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 14 * DAY_MS;
const CURRENT_LIMIT = 20;
const WATCHED_LIMIT = 50;

const iso = (ms) => new Date(ms).toISOString();
const seconds = (n) => Math.round(Number(n) || 0);

// The last `count` local days, oldest first, ending today. Walks calendar days so DST shifts do not skip one.
function daysBack(now, count) {
  const today = new Date(now);
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i).getTime()));
  }
  return days;
}

export function createActivity({ db, accounts }) {
  const raw = db.raw;
  const stmts = {
    accountById: raw.prepare('SELECT * FROM accounts WHERE id = ?'),
    accounts: raw.prepare('SELECT * FROM accounts ORDER BY id'),
    profiles: raw.prepare('SELECT * FROM profiles WHERE accountId = ? ORDER BY id'),
    sessionLast: raw.prepare('SELECT MAX(lastSeenAt) AS at FROM sessions WHERE accountId = ?'),
    streamTotal: raw.prepare('SELECT COALESCE(SUM(watchedSeconds), 0) AS s FROM watch_progress WHERE profileId = ?'),
    dailySince: raw.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM watch_daily WHERE profileId = ? AND day >= ?'),
    dailyRows: raw.prepare('SELECT day, seconds FROM watch_daily WHERE profileId = ? AND day >= ?'),
    streamLast: raw.prepare('SELECT MAX(updatedAt) AS at FROM watch_progress WHERE profileId = ?'),
    streamCurrent: raw.prepare(`
      SELECT bookId, episodeIndex, position, duration, updatedAt FROM watch_progress
      WHERE profileId = ? AND completed = 0 AND updatedAt >= ?`),
    streamCompleted: raw.prepare('SELECT bookId, episodeIndex, updatedAt FROM watch_progress WHERE profileId = ? AND completed = 1'),
    favourites: raw.prepare('SELECT bookId FROM favourites WHERE profileId = ? ORDER BY createdAt DESC'),
  };

  const showOf = (bookId) => db.getShow(bookId) || { bookId, name: bookId, cover: '' };

  function watchTotals(profileId, now) {
    const total = stmts.streamTotal.get(profileId).s;
    const d7 = stmts.dailySince.get(profileId, daysBack(now, 7)[0]).s;
    const d30 = stmts.dailySince.get(profileId, daysBack(now, 30)[0]).s;
    return { total: seconds(total), d7: seconds(d7), d30: seconds(d30) };
  }

  function currentRows(profileId, now) {
    const since = now - ACTIVE_WINDOW_MS;
    return stmts.streamCurrent.all(profileId, since).map((r) => ({ ...r, kind: 'stream' }));
  }

  return {
    summary() {
      const now = Date.now();
      return stmts.accounts.all().map((a) => {
        const profiles = stmts.profiles.all(a.id);
        const totals = { total: 0, d7: 0, d30: 0 };
        let lastMs = Date.parse(stmts.sessionLast.get(a.id).at) || 0;
        let currentlyWatching = 0;
        let favourites = 0;
        for (const p of profiles) {
          const w = watchTotals(p.id, now);
          totals.total += w.total;
          totals.d7 += w.d7;
          totals.d30 += w.d30;
          lastMs = Math.max(lastMs, stmts.streamLast.get(p.id).at || 0);
          currentlyWatching += currentRows(p.id, now).length;
          favourites += stmts.favourites.all(p.id).length;
        }
        return {
          account: { id: a.id, username: a.username, role: a.role, disabled: !!a.disabled, lastLoginAt: a.lastLoginAt ?? null },
          profiles: profiles.length,
          watchSeconds: totals,
          lastActiveAt: lastMs ? iso(lastMs) : null,
          currentlyWatching,
          favourites,
        };
      });
    },

    user(accountId) {
      const row = stmts.accountById.get(accountId);
      if (!row) throw httpError(404, 'Account not found');
      const now = Date.now();
      const days = daysBack(now, 30);
      const profiles = stmts.profiles.all(accountId).map((p) => {
        const dailyByDay = new Map(stmts.dailyRows.all(p.id, days[0]).map((r) => [r.day, r.seconds]));

        const currentlyWatching = currentRows(p.id, now)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, CURRENT_LIMIT)
          .map((r) => ({
            show: showOf(r.bookId),
            episodeIndex: r.episodeIndex,
            position: r.position,
            duration: r.duration,
            percent: r.duration > 0 ? Math.min(100, Math.round((r.position / r.duration) * 100)) : 0,
            kind: r.kind,
            updatedAt: iso(r.updatedAt),
          }));

        const byBook = new Map();
        for (const r of stmts.streamCompleted.all(p.id)) {
          const entry = byBook.get(r.bookId) ?? { episodes: new Set(), lastMs: 0 };
          entry.episodes.add(r.episodeIndex);
          entry.lastMs = Math.max(entry.lastMs, r.updatedAt);
          byBook.set(r.bookId, entry);
        }
        const watched = [...byBook.entries()]
          .sort((a, b) => b[1].lastMs - a[1].lastMs)
          .slice(0, WATCHED_LIMIT)
          .map(([bookId, entry]) => ({
            show: showOf(bookId),
            episodes: entry.episodes.size,
            lastWatchedAt: iso(entry.lastMs),
          }));

        return {
          id: p.id,
          name: p.name,
          color: p.color,
          watchSeconds: watchTotals(p.id, now),
          daily: days.map((day) => ({ day, seconds: seconds(dailyByDay.get(day) ?? 0) })),
          currentlyWatching,
          watched,
          favourites: stmts.favourites.all(p.id).map((f) => showOf(f.bookId)),
        };
      });
      return { account: toAccount(row), devices: accounts.listDevices(accountId, null), profiles };
    },
  };
}
