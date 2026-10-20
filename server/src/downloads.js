import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { httpError } from './errors.js';
import { isWindowsPath, sanitizeSegment } from './paths.js';

export { sanitizeSegment };

const PROGRESS_INTERVAL_MS = 500;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [10000, 60000, 300000];

function retryDelayMs(attempts) {
  const env = process.env.RETRY_BACKOFF_SCALE;
  const scale = env !== undefined && env !== '' && Number.isFinite(Number(env)) ? Number(env) : 1;
  const idx = Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1;
  return Math.round(BACKOFF_MS[idx] * scale);
}

function permanentError(message) {
  const err = new Error(message);
  err.permanent = true;
  return err;
}

function pauseError() {
  const err = new Error('Download paused');
  err.name = 'AbortError';
  return err;
}

const PERMANENT_FS_CODES = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'ENOTDIR']);

// Filesystem failures are not worth four retries and produce cryptic messages on their own.
function describeFsError(err, root) {
  if (!err?.code || !PERMANENT_FS_CODES.has(err.code)) return null;
  const target = err.path || root;
  if (err.code === 'ENOSPC') return `Cannot write to "${target}": the disk is full.`;
  if (err.code === 'EROFS') return `Cannot write to "${target}": the folder is read-only.`;
  if (err.code === 'ENOTDIR') return `Cannot write to "${target}": part of the path is not a folder.`;
  return `Cannot write to "${target}" (permission denied). If LocalDrama runs in Docker, the download folder must be a path inside the container — use /media in Settings → Storage.`;
}

function checkDownloadRoot(root) {
  if (!root) throw permanentError('Download folder is not configured');
  if (process.platform !== 'win32' && isWindowsPath(root)) {
    throw permanentError(
      `Download folder "${root}" is a Windows path, but LocalDrama is running in Linux (for example in Docker). Set the download folder to /media in Settings → Storage.`,
    );
  }
}

// fetch (undici) ignores Node agents, so MP4s use https.get; the proxy patch in proxy.js routes dramaboxdb hosts.
function openStream(url, { signal, range } = {}, hops = 5) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const mod = target.protocol === 'http:' ? http : https;
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (range) headers.Range = `bytes=${range}-`;
    const req = mod.get(target, { headers, signal }, (res) => {
      if (REDIRECT_CODES.has(res.statusCode) && res.headers.location) {
        res.resume();
        if (hops <= 0) return reject(new Error('Too many redirects'));
        return resolve(openStream(new URL(res.headers.location, target).toString(), { signal, range }, hops - 1));
      }
      resolve(res);
    });
    req.on('error', reject);
  });
}

async function partSize(file) {
  try {
    return (await fs.promises.stat(file)).size;
  } catch {
    return 0;
  }
}

export function episodeFileName(showName, episodeIndex, episodeName) {
  const nn = String(episodeIndex + 1).padStart(2, '0');
  const show = sanitizeSegment(showName, 60);
  const episode = sanitizeSegment(episodeName || `Episode ${nn}`, 50);
  return `${show} - E${nn} - ${episode}.mp4`;
}

export function pickVideoUrl(chapter, maxQuality) {
  const cdns = chapter.cdnList ?? [];
  const ordered = [...cdns.filter((c) => c.isDefault === 1), ...cdns.filter((c) => c.isDefault !== 1)];
  for (const cdn of ordered) {
    let best = null;
    for (const v of cdn.videoPathList ?? []) {
      if (v.isVipEquity === 1 || !v.videoPath || Number(v.quality) > maxQuality) continue;
      if (!best || Number(v.quality) > Number(best.quality)) best = v;
    }
    if (best) return best.videoPath;
  }
  return null;
}

export function toDownloadItem(row) {
  return {
    id: row.id,
    bookId: row.bookId,
    showName: row.showName,
    episodeIndex: row.episodeIndex,
    episodeName: row.episodeName,
    status: row.status,
    bytesDone: row.bytesDone,
    bytesTotal: row.bytesTotal,
    error: row.error ?? undefined,
    filePath: row.filePath ?? undefined,
    attempts: row.attempts ?? 0,
    nextAttemptAt: row.nextAttemptAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function destFor(row, root) {
  const showDir = sanitizeSegment(row.showName || row.bookId, 120);
  return path.join(root, showDir, episodeFileName(row.showName || row.bookId, row.episodeIndex, row.episodeName));
}

export function createDownloadManager({ db, provider, events, getConfig, library, integrations }) {
  const raw = db.raw;
  const active = new Set();
  const controllers = new Map();
  const pauseRequested = new Set();
  let wakeTimer = null;

  const nowIso = () => new Date().toISOString();

  const stmts = {
    insertIgnore: raw.prepare(`
      INSERT OR IGNORE INTO downloads (bookId, showName, episodeIndex, episodeName, chapterId, status, bytesDone, bytesTotal, createdAt, updatedAt)
      VALUES (@bookId, @showName, @episodeIndex, @episodeName, @chapterId, 'queued', 0, 0, @now, @now)`),
    resetFailed: raw.prepare(`
      UPDATE downloads SET status = 'queued', error = NULL, bytesDone = 0, bytesTotal = 0, attempts = 0, nextAttemptAt = NULL, updatedAt = ?
      WHERE bookId = ? AND episodeIndex = ? AND status = 'failed'`),
    byId: raw.prepare('SELECT * FROM downloads WHERE id = ?'),
    byBookAndIndex: raw.prepare('SELECT * FROM downloads WHERE bookId = ? AND episodeIndex = ?'),
    byStatus: raw.prepare('SELECT * FROM downloads WHERE status = ? AND cleared = 0 ORDER BY id'),
    all: raw.prepare('SELECT * FROM downloads WHERE cleared = 0 ORDER BY id DESC'),
    queued: raw.prepare("SELECT * FROM downloads WHERE status = 'queued' AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?) ORDER BY id"),
    nextWake: raw.prepare("SELECT MIN(nextAttemptAt) AS at FROM downloads WHERE status = 'queued' AND nextAttemptAt > ?"),
    resetDownloading: raw.prepare("UPDATE downloads SET status = 'queued', bytesDone = 0, updatedAt = ? WHERE status = 'downloading'"),
    setDownloading: raw.prepare("UPDATE downloads SET status = 'downloading', error = NULL, bytesDone = 0, bytesTotal = 0, updatedAt = ? WHERE id = ?"),
    setQueued: raw.prepare("UPDATE downloads SET status = 'queued', nextAttemptAt = NULL, updatedAt = ? WHERE id = ?"),
    setPaused: raw.prepare("UPDATE downloads SET status = 'paused', updatedAt = ? WHERE id = ?"),
    setRetryQueued: raw.prepare("UPDATE downloads SET status = 'queued', error = NULL, attempts = 0, nextAttemptAt = NULL, updatedAt = ? WHERE id = ?"),
    progress: raw.prepare('UPDATE downloads SET bytesDone = ?, bytesTotal = ?, updatedAt = ? WHERE id = ?'),
    complete: raw.prepare("UPDATE downloads SET status = 'completed', filePath = ?, bytesDone = ?, bytesTotal = ?, error = NULL, nextAttemptAt = NULL, updatedAt = ? WHERE id = ?"),
    retryLater: raw.prepare("UPDATE downloads SET status = 'queued', attempts = ?, error = ?, nextAttemptAt = ?, updatedAt = ? WHERE id = ?"),
    fail: raw.prepare("UPDATE downloads SET status = 'failed', attempts = ?, error = ?, nextAttemptAt = NULL, updatedAt = ? WHERE id = ?"),
    clearCompleted: raw.prepare("UPDATE downloads SET cleared = 1, updatedAt = ? WHERE status = 'completed' AND cleared = 0"),
    remove: raw.prepare('DELETE FROM downloads WHERE id = ?'),
  };

  function emitRow(id) {
    const row = stmts.byId.get(id);
    if (row) events.emit('download', toDownloadItem(row));
  }

  function writeProgress(id, bytesDone, bytesTotal) {
    stmts.progress.run(bytesDone, bytesTotal, nowIso(), id);
    emitRow(id);
  }

  function partPathFor(row) {
    const root = getConfig().downloadRoot;
    return root ? `${destFor(row, root)}.part` : null;
  }

  async function syncPartProgress(row) {
    const part = partPathFor(row);
    const current = stmts.byId.get(row.id);
    if (!part || !current) return;
    stmts.progress.run(await partSize(part), current.bytesTotal, nowIso(), row.id);
    emitRow(row.id);
  }

  async function streamToFile(url, dest, row, signal) {
    const part = `${dest}.part`;
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });

    let offset = await partSize(part);
    let res = await openStream(url, { signal, range: offset || undefined });
    if (offset && res.statusCode === 416) {
      res.resume();
      await fs.promises.rm(part, { force: true });
      offset = 0;
      res = await openStream(url, { signal });
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume();
      const err = new Error(`Download failed: HTTP ${res.statusCode}`);
      err.expired = res.statusCode === 401 || res.statusCode === 403;
      throw err;
    }

    const resumed = offset > 0 && res.statusCode === 206;
    if (!resumed) offset = 0;
    const length = Number(res.headers['content-length']) || 0;
    const range = /\/(\d+)$/.exec(res.headers['content-range'] || '');
    const total = resumed ? (range ? Number(range[1]) : offset + length) : length;

    let done = offset;
    let last = 0;
    writeProgress(row.id, done, total);

    const counter = new Transform({
      transform(chunk, _enc, cb) {
        done += chunk.length;
        const now = Date.now();
        if (now - last >= PROGRESS_INTERVAL_MS) {
          last = now;
          writeProgress(row.id, done, total);
        }
        cb(null, chunk);
      },
    });

    await pipeline(res, counter, fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' }));
    const size = await partSize(part);
    if (size === 0) {
      await fs.promises.rm(part, { force: true });
      throw new Error('Downloaded file is empty');
    }
    if (total && size !== total) throw new Error(`Incomplete download (${size} of ${total} bytes)`);
    await fs.promises.rename(part, dest);
    return size;
  }

  async function download(row, signal) {
    const cfg = getConfig();
    checkDownloadRoot(cfg.downloadRoot);
    const dest = destFor(row, cfg.downloadRoot);
    await library.writeSidecars(row.bookId, path.dirname(dest), row.showName);

    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) throw pauseError();
      const data = await provider.chapters(row.bookId, { fresh: attempt > 0 });
      const chapter = data.chapters.find((c) => c.index === row.episodeIndex);
      if (!chapter) throw permanentError('Episode no longer exists upstream');

      const url = pickVideoUrl(chapter, cfg.quality) ?? (await provider.streamUrl(row.bookId, row.episodeIndex));
      try {
        const size = await streamToFile(url, dest, row, signal);
        return { filePath: dest, size };
      } catch (err) {
        const fsMessage = describeFsError(err, cfg.downloadRoot);
        if (fsMessage) throw permanentError(fsMessage);
        lastErr = err;
        if (!err.expired || signal.aborted) break;
      }
    }
    throw lastErr;
  }

  function failOrRetry(row, err) {
    const current = stmts.byId.get(row.id);
    if (!current) return;
    const attempts = (current.attempts || 0) + 1;
    const message = String(err?.message || err);
    const now = nowIso();
    if (err.permanent || attempts >= MAX_ATTEMPTS) {
      stmts.fail.run(attempts, message, now, row.id);
    } else {
      stmts.retryLater.run(attempts, message, Date.now() + retryDelayMs(attempts), now, row.id);
    }
    emitRow(row.id);
  }

  async function run(row) {
    const controller = new AbortController();
    controllers.set(row.id, controller);
    try {
      const { filePath, size } = await download(row, controller.signal);
      stmts.complete.run(filePath, size, size, nowIso(), row.id);
      emitRow(row.id);
      events.emit('library', { bookId: row.bookId });
      integrations?.notifyDownloadComplete();
    } catch (err) {
      if (pauseRequested.has(row.id)) await syncPartProgress(row);
      else failOrRetry(row, err);
    } finally {
      controllers.delete(row.id);
      pauseRequested.delete(row.id);
      active.delete(row.id);
      pump();
    }
  }

  function start(row) {
    active.add(row.id);
    stmts.setDownloading.run(nowIso(), row.id);
    emitRow(row.id);
    run(row).catch(() => {});
  }

  function scheduleWake() {
    clearTimeout(wakeTimer);
    wakeTimer = null;
    const { at } = stmts.nextWake.get(Date.now());
    if (at == null) return;
    wakeTimer = setTimeout(pump, Math.max(0, at - Date.now()) + 25);
    wakeTimer.unref();
  }

  function pump() {
    const max = Math.max(1, Number(getConfig().concurrency) || 1);
    for (const row of stmts.queued.all(Date.now())) {
      if (active.size >= max) break;
      if (active.has(row.id)) continue;
      start(row);
    }
    scheduleWake();
  }

  return {
    init() {
      stmts.resetDownloading.run(nowIso());
    },

    kick: pump,

    async enqueue(bookId, episodes) {
      const id = String(bookId ?? '').trim();
      if (!id) throw httpError(400, 'bookId is required');

      const data = await provider.chapters(id);
      const byIndex = new Map(data.chapters.map((c) => [c.index, c]));

      let indexes;
      if (episodes == null) {
        indexes = [...byIndex.keys()].sort((a, b) => a - b);
      } else {
        if (!Array.isArray(episodes)) throw httpError(400, 'episodes must be an array of indexes');
        indexes = [...new Set(episodes)];
        for (const idx of indexes) {
          if (!Number.isInteger(idx) || !byIndex.has(idx)) throw httpError(400, `Unknown episode index ${idx}`);
        }
      }

      const showName = db.getShow(id)?.name || id;
      const insertedIds = [];
      const addAll = raw.transaction(() => {
        for (const idx of indexes) {
          const chapter = byIndex.get(idx);
          const now = nowIso();
          const res = stmts.insertIgnore.run({
            bookId: id,
            showName,
            episodeIndex: idx,
            episodeName: chapter.name,
            chapterId: chapter.chapterId,
            now,
          });
          if (res.changes > 0) {
            insertedIds.push(res.lastInsertRowid);
            continue;
          }
          const reset = stmts.resetFailed.run(now, id, idx);
          if (reset.changes > 0) {
            insertedIds.push(stmts.byBookAndIndex.get(id, idx).id);
          }
        }
      });
      addAll();

      for (const rowId of insertedIds) emitRow(rowId);
      pump();
      return insertedIds.length;
    },

    list() {
      return stmts.all.all().map(toDownloadItem);
    },

    retry(id) {
      const row = stmts.byId.get(id);
      if (!row) throw httpError(404, 'Download not found');
      if (row.status !== 'failed') throw httpError(400, 'Only failed downloads can be retried');
      stmts.setRetryQueued.run(nowIso(), id);
      emitRow(id);
      pump();
    },

    async pause(id) {
      const row = stmts.byId.get(id);
      if (!row) throw httpError(404, 'Download not found');
      if (row.status === 'paused') return;
      if (row.status !== 'queued' && row.status !== 'downloading') {
        throw httpError(400, 'Only queued or downloading downloads can be paused');
      }
      const controller = controllers.get(id);
      if (row.status === 'downloading' && controller) {
        pauseRequested.add(id);
        controller.abort();
      }
      stmts.setPaused.run(nowIso(), id);
      if (row.status === 'downloading') await syncPartProgress(row);
      emitRow(id);
    },

    resume(id) {
      const row = stmts.byId.get(id);
      if (!row) throw httpError(404, 'Download not found');
      if (row.status !== 'paused') throw httpError(400, 'Only paused downloads can be resumed');
      stmts.setQueued.run(nowIso(), id);
      emitRow(id);
      pump();
    },

    async pauseAll() {
      for (const row of [...stmts.byStatus.all('queued'), ...stmts.byStatus.all('downloading')]) {
        await this.pause(row.id);
      }
    },

    resumeAll() {
      for (const row of stmts.byStatus.all('paused')) this.resume(row.id);
    },

    clearCompleted() {
      return stmts.clearCompleted.run(nowIso()).changes;
    },

    remove(id) {
      const row = stmts.byId.get(id);
      if (!row) throw httpError(404, 'Download not found');
      if (row.status === 'completed') throw httpError(400, 'Completed downloads cannot be removed');
      if (row.status === 'downloading') throw httpError(409, 'Download is in progress');
      stmts.remove.run(id);
      const part = partPathFor(row);
      if (part) fs.promises.rm(part, { force: true }).catch(() => {});
    },
  };
}
