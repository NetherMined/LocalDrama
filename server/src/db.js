import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shows (
  bookId TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  introduction TEXT NOT NULL DEFAULT '',
  episodeCount INTEGER NOT NULL DEFAULT 0,
  playCount TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT,
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bookId TEXT NOT NULL,
  showName TEXT NOT NULL DEFAULT '',
  episodeIndex INTEGER NOT NULL,
  episodeName TEXT NOT NULL DEFAULT '',
  chapterId TEXT,
  status TEXT NOT NULL,
  bytesDone INTEGER NOT NULL DEFAULT 0,
  bytesTotal INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  filePath TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt INTEGER,
  cleared INTEGER NOT NULL DEFAULT 0,
  UNIQUE(bookId, episodeIndex)
);
CREATE INDEX IF NOT EXISTS downloads_status ON downloads(status);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  pinHash TEXT,
  isAdmin INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_sessions (
  token TEXT PRIMARY KEY,
  profileId INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  profileId INTEGER NOT NULL,
  downloadId INTEGER NOT NULL,
  bookId TEXT NOT NULL,
  episodeIndex INTEGER NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (profileId, downloadId)
);
CREATE INDEX IF NOT EXISTS progress_download ON progress(downloadId);
CREATE INDEX IF NOT EXISTS progress_profile_updated ON progress(profileId, updatedAt);
`;

const ADDED_COLUMNS = {
  downloads: {
    attempts: 'INTEGER NOT NULL DEFAULT 0',
    nextAttemptAt: 'INTEGER',
    cleared: 'INTEGER NOT NULL DEFAULT 0',
  },
};

function ensureColumns(raw) {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const existing = new Set(raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, definition] of Object.entries(columns)) {
      if (!existing.has(name)) raw.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

const UPSERT_SHOW = `
INSERT INTO shows (bookId, name, cover, introduction, episodeCount, playCount, tags, status, updatedAt)
VALUES (@bookId, @name, @cover, @introduction, @episodeCount, @playCount, @tags, @status, @updatedAt)
ON CONFLICT(bookId) DO UPDATE SET
  name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE shows.name END,
  cover = CASE WHEN excluded.cover <> '' THEN excluded.cover ELSE shows.cover END,
  introduction = CASE WHEN excluded.introduction <> '' THEN excluded.introduction ELSE shows.introduction END,
  episodeCount = CASE WHEN excluded.episodeCount > 0 THEN excluded.episodeCount ELSE shows.episodeCount END,
  playCount = CASE WHEN excluded.playCount <> '' THEN excluded.playCount ELSE shows.playCount END,
  tags = CASE WHEN excluded.tags <> '[]' THEN excluded.tags ELSE shows.tags END,
  status = COALESCE(excluded.status, shows.status),
  updatedAt = excluded.updatedAt
`;

export function toShow(row) {
  return {
    bookId: row.bookId,
    name: row.name,
    cover: row.cover,
    introduction: row.introduction,
    episodeCount: row.episodeCount,
    playCount: row.playCount,
    tags: JSON.parse(row.tags || '[]'),
    status: row.status ?? null,
  };
}

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const raw = new Database(path.join(dataDir, 'library.db'));
  raw.pragma('journal_mode = WAL');
  raw.exec(SCHEMA);
  ensureColumns(raw);
  if (raw.prepare('SELECT COUNT(*) AS n FROM profiles').get().n === 0) {
    raw.prepare('INSERT INTO profiles (name, color, pinHash, isAdmin, createdAt) VALUES (?, ?, NULL, 1, ?)')
      .run('Me', '#e11d48', new Date().toISOString());
  }

  const upsert = raw.prepare(UPSERT_SHOW);
  const getShowStmt = raw.prepare('SELECT * FROM shows WHERE bookId = ?');

  const upsertShows = raw.transaction((items) => {
    const updatedAt = new Date().toISOString();
    for (const s of items) {
      if (!s.bookId) continue;
      upsert.run({
        bookId: s.bookId,
        name: s.name || '',
        cover: s.cover || '',
        introduction: s.introduction || '',
        episodeCount: s.episodeCount || 0,
        playCount: s.playCount || '',
        tags: JSON.stringify(s.tags || []),
        status: s.status || null,
        updatedAt,
      });
    }
  });

  return {
    raw,
    upsertShows,
    getShow(bookId) {
      const row = getShowStmt.get(String(bookId));
      return row ? toShow(row) : null;
    },
  };
}
