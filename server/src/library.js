import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { httpError } from './errors.js';
import { getAgent, isProxiedHost } from './proxy.js';
import { sanitizeSegment } from './paths.js';

const SHOW_FILE = 'show.json';
const POSTER_FILE = 'poster.jpg';
const EPISODE_RE = /^(.*) - E(\d+)(?: - (.*))?\.mp4$/;
const REMOTE_URL = /^https?:\/\//i;

const isMp4 = (name) => name.toLowerCase().endsWith('.mp4');

export function showFor(db, bookId, fallbackName) {
  return db.getShow(bookId) ?? {
    bookId,
    name: fallbackName || bookId,
    cover: '',
    introduction: '',
    episodeCount: 0,
    playCount: '',
    tags: [],
    status: null,
  };
}

export function episodeFromRow(row, progress = null) {
  return {
    id: row.id,
    episodeIndex: row.episodeIndex,
    name: row.episodeName,
    filePath: row.filePath,
    size: fs.statSync(row.filePath).size,
    mediaUrl: `/media/${row.id}`,
    progress,
  };
}

function fetchPoster(url, dest) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const mod = target.protocol === 'http:' ? http : https;
    const agent = isProxiedHost(target.hostname) ? getAgent() : undefined;
    const req = mod.get(target, { agent, timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Poster request failed: HTTP ${res.statusCode}`));
      }
      const tmp = `${dest}.tmp`;
      pipeline(res, fs.createWriteStream(tmp))
        .then(() => fs.promises.rename(tmp, dest))
        .then(resolve, (err) => {
          fs.promises.rm(tmp, { force: true }).catch(() => {});
          reject(err);
        });
    });
    req.on('timeout', () => req.destroy(new Error('Poster request timed out')));
    req.on('error', reject);
  });
}

async function readShowJson(dir) {
  try {
    return JSON.parse(await fs.promises.readFile(path.join(dir, SHOW_FILE), 'utf8'));
  } catch {
    return null;
  }
}

export function createLibrary({ db, getConfig, events }) {
  const raw = db.raw;

  const stmts = {
    byId: raw.prepare('SELECT * FROM downloads WHERE id = ?'),
    byBookAndIndex: raw.prepare('SELECT * FROM downloads WHERE bookId = ? AND episodeIndex = ?'),
    completed: raw.prepare("SELECT id, bookId, filePath FROM downloads WHERE status = 'completed'"),
    completedForBook: raw.prepare("SELECT filePath FROM downloads WHERE status = 'completed' AND bookId = ? AND filePath IS NOT NULL"),
    insertScanned: raw.prepare(`
      INSERT OR IGNORE INTO downloads (bookId, showName, episodeIndex, episodeName, chapterId, status, bytesDone, bytesTotal, filePath, cleared, attempts, createdAt, updatedAt)
      VALUES (@bookId, @showName, @episodeIndex, @episodeName, NULL, 'completed', @size, @size, @filePath, 1, 0, @now, @now)`),
    setFile: raw.prepare('UPDATE downloads SET filePath = ?, bytesDone = ?, bytesTotal = ?, updatedAt = ? WHERE id = ?'),
    remove: raw.prepare('DELETE FROM downloads WHERE id = ?'),
    clearProgress: raw.prepare('DELETE FROM progress WHERE downloadId = ?'),
  };

  async function writeSidecars(bookId, dir, fallbackName) {
    try {
      const show = db.getShow(bookId);
      const cover = show?.cover && REMOTE_URL.test(show.cover) ? show.cover : '';
      await fs.promises.mkdir(dir, { recursive: true });
      const data = {
        bookId: String(bookId),
        name: show?.name || fallbackName || String(bookId),
        cover,
        introduction: show?.introduction || '',
        tags: show?.tags || [],
        episodeCount: show?.episodeCount || 0,
      };
      await fs.promises.writeFile(path.join(dir, SHOW_FILE), JSON.stringify(data, null, 2));
      const poster = path.join(dir, POSTER_FILE);
      if (cover && !fs.existsSync(poster)) await fetchPoster(cover, poster).catch(() => {});
    } catch {
      // Sidecars help media servers but must never fail a download.
    }
  }

  function posterFor(bookId) {
    for (const row of stmts.completedForBook.all(String(bookId))) {
      const file = path.join(path.dirname(row.filePath), POSTER_FILE);
      if (fs.existsSync(file)) return file;
    }
    return null;
  }

  async function cleanupFolder(dir) {
    const names = await fs.promises.readdir(dir).catch(() => null);
    if (!names || names.some(isMp4)) return;
    await fs.promises.rm(path.join(dir, SHOW_FILE), { force: true });
    await fs.promises.rm(path.join(dir, POSTER_FILE), { force: true });
    await fs.promises.rmdir(dir).catch(() => {});
  }

  async function scan() {
    const cfg = getConfig();
    const root = cfg.downloadRoot;
    const result = { added: 0, removed: 0 };
    if (!cfg.configured || !root || !fs.existsSync(root)) return result;

    const now = new Date().toISOString();
    const touched = new Set();
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    const pathKey = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
    const known = new Map();
    for (const row of stmts.completed.all()) if (row.filePath) known.set(pathKey(row.filePath), row);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const names = await fs.promises.readdir(dir).catch(() => []);
      const episodes = [];
      for (const name of names) {
        const m = EPISODE_RE.exec(name);
        if (!m || Number(m[2]) < 1) continue;
        episodes.push({
          episodeIndex: Number(m[2]) - 1,
          episodeName: m[3] || `Episode ${m[2].padStart(2, '0')}`,
          filePath: path.join(dir, name),
        });
      }
      if (!episodes.length) continue;

      const sidecar = await readShowJson(dir);
      // Folders from before sidecars existed: take the bookId from rows that already track these files.
      const trackedBookId = episodes.map((ep) => known.get(pathKey(ep.filePath))?.bookId).find(Boolean);
      const bookId = sidecar?.bookId ? String(sidecar.bookId) : trackedBookId || `local-${sanitizeSegment(entry.name, 100)}`;
      if (!sidecar && trackedBookId) await writeSidecars(bookId, dir, entry.name);
      const showName = sidecar?.name || entry.name;
      const hasPoster = fs.existsSync(path.join(dir, POSTER_FILE));

      db.upsertShows([{
        bookId,
        name: showName,
        cover: sidecar?.cover || (hasPoster ? `/api/library/poster/${encodeURIComponent(bookId)}` : ''),
        introduction: sidecar?.introduction || '',
        episodeCount: sidecar?.episodeCount || 0,
        playCount: '',
        tags: Array.isArray(sidecar?.tags) ? sidecar.tags : [],
        status: null,
      }]);

      for (const ep of episodes) {
        if (known.has(pathKey(ep.filePath))) continue;
        const existing = stmts.byBookAndIndex.get(bookId, ep.episodeIndex);
        if (existing) {
          if (existing.status === 'completed' && existing.filePath !== ep.filePath
            && (!existing.filePath || !fs.existsSync(existing.filePath))) {
            const { size } = await fs.promises.stat(ep.filePath);
            stmts.setFile.run(ep.filePath, size, size, now, existing.id);
          }
          continue;
        }
        const { size } = await fs.promises.stat(ep.filePath);
        const res = stmts.insertScanned.run({
          bookId,
          showName,
          episodeIndex: ep.episodeIndex,
          episodeName: ep.episodeName,
          size,
          filePath: ep.filePath,
          now,
        });
        if (res.changes > 0) {
          result.added += 1;
          touched.add(bookId);
        }
      }
    }

    for (const row of stmts.completed.all()) {
      if (!row.filePath || !fs.existsSync(row.filePath)) {
        stmts.clearProgress.run(row.id);
        stmts.remove.run(row.id);
        result.removed += 1;
        touched.add(row.bookId);
      }
    }

    for (const bookId of touched) events.emit('library', { bookId });
    return result;
  }

  async function deleteEpisode(id) {
    const row = stmts.byId.get(id);
    if (!row || row.status !== 'completed') throw httpError(404, 'Episode not found');
    if (row.filePath) await fs.promises.rm(row.filePath, { force: true });
    stmts.clearProgress.run(id);
    stmts.remove.run(id);
    if (row.filePath) await cleanupFolder(path.dirname(row.filePath));
    events.emit('library', { bookId: row.bookId });
    return { ok: true };
  }

  return { writeSidecars, posterFor, scan, deleteEpisode };
}
