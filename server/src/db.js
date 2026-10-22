import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './config.js';

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
  updatedAt TEXT NOT NULL,
  sourceId TEXT
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
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  mustChangePassword INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  createdBy INTEGER,
  lastLoginAt TEXT
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT NOT NULL,
  accountId INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  userAgent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  firstSeenAt TEXT NOT NULL,
  lastSeenAt TEXT NOT NULL,
  PRIMARY KEY (id, accountId)
);
CREATE INDEX IF NOT EXISTS devices_account ON devices(accountId);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accountId INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  readAt TEXT
);
CREATE INDEX IF NOT EXISTS notifications_account_read ON notifications(accountId, readAt);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  pinHash TEXT,
  isAdmin INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  accountId INTEGER
);
CREATE INDEX IF NOT EXISTS profiles_account ON profiles(accountId);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_name ON profiles(accountId, name);
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
CREATE TABLE IF NOT EXISTS watch_progress (
  profileId INTEGER NOT NULL,
  bookId TEXT NOT NULL,
  episodeIndex INTEGER NOT NULL,
  sourceId TEXT,
  position REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  watchedSeconds REAL NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (profileId, bookId, episodeIndex)
);
CREATE INDEX IF NOT EXISTS watch_progress_profile_updated ON watch_progress(profileId, updatedAt);
CREATE TABLE IF NOT EXISTS watch_daily (
  profileId INTEGER NOT NULL,
  day TEXT NOT NULL,
  seconds REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (profileId, day)
);
CREATE TABLE IF NOT EXISTS favourites (
  profileId INTEGER NOT NULL,
  bookId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (profileId, bookId)
);
CREATE TABLE IF NOT EXISTS likes (
  accountId INTEGER NOT NULL,
  bookId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (accountId, bookId)
);
CREATE TABLE IF NOT EXISTS follows (
  accountId INTEGER NOT NULL,
  bookId TEXT NOT NULL,
  sourceId TEXT,
  knownEpisodes INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  checkedAt TEXT,
  PRIMARY KEY (accountId, bookId)
);
`;

const ADDED_COLUMNS = {
  accounts: {
    pending: 'INTEGER NOT NULL DEFAULT 0',
    requestNote: 'TEXT',
  },
  sessions: {
    accountId: 'INTEGER',
    deviceId: 'TEXT',
    lastSeenAt: 'TEXT',
  },
  profiles: {
    accountId: 'INTEGER',
  },
  downloads: {
    attempts: 'INTEGER NOT NULL DEFAULT 0',
    nextAttemptAt: 'INTEGER',
    cleared: 'INTEGER NOT NULL DEFAULT 0',
  },
  shows: {
    sourceId: 'TEXT',
  },
  progress: {
    watchedSeconds: 'REAL NOT NULL DEFAULT 0',
  },
  notifications: {
    link: 'TEXT',
  },
};

// Free/VIP tiers, points, rewards and sharing were removed. Their tables are dropped on every start.
const REMOVED_TABLES = ['unlocks', 'points_ledger', 'daily_rewards', 'share_links', 'share_opens'];

function dropRemovedTables(raw) {
  for (const table of REMOVED_TABLES) raw.exec(`DROP TABLE IF EXISTS ${table}`);
}

function ensureColumns(raw) {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const existing = new Set(raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, definition] of Object.entries(columns)) {
      if (existing.has(name)) continue;
      raw.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

// Profile names were globally unique; they are now unique per account. SQLite cannot drop a
// column constraint, so the profiles table is rebuilt once when the old UNIQUE(name) exists.
function dropGlobalProfileNameUnique(raw) {
  const unique = raw.prepare('PRAGMA index_list(profiles)').all().some((i) => i.unique && i.origin === 'u');
  if (!unique) return;
  raw.transaction(() => {
    raw.exec(`
      CREATE TABLE profiles_rebuild (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        pinHash TEXT,
        isAdmin INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        accountId INTEGER
      );
      INSERT INTO profiles_rebuild (id, name, color, pinHash, isAdmin, createdAt, accountId)
        SELECT id, name, color, pinHash, isAdmin, createdAt, accountId FROM profiles;
      DROP TABLE profiles;
      ALTER TABLE profiles_rebuild RENAME TO profiles;
    `);
  })();
}

// Idempotent. On the first start it creates the admin account (carrying over the old shared
// password hash, if any), attaches unowned profiles to it and drops sessions that predate
// accounts, so everyone signs in once after the upgrade.
function migrateAccounts(raw, legacyPasswordHash) {
  raw.transaction(() => {
    const now = new Date().toISOString();
    if (raw.prepare('SELECT COUNT(*) AS n FROM accounts').get().n === 0) {
      raw.prepare(`INSERT INTO accounts (username, passwordHash, role, mustChangePassword, disabled, createdAt, createdBy)
        VALUES ('admin', ?, 'admin', 0, 0, ?, NULL)`).run(legacyPasswordHash || null, now);
    }
    const admin = raw.prepare("SELECT id FROM accounts WHERE role = 'admin' ORDER BY id LIMIT 1").get();
    raw.prepare('UPDATE profiles SET accountId = ? WHERE accountId IS NULL').run(admin.id);
    raw.prepare('DELETE FROM sessions WHERE accountId IS NULL').run();
    raw.exec('CREATE INDEX IF NOT EXISTS sessions_account ON sessions(accountId)');
    raw.exec('CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_name ON profiles(accountId, name)');
    if (raw.prepare('SELECT COUNT(*) AS n FROM profiles').get().n === 0) {
      raw.prepare('INSERT INTO profiles (name, color, pinHash, isAdmin, createdAt, accountId) VALUES (?, ?, NULL, 0, ?, ?)')
        .run('Me', '#e11d48', now, admin.id);
    }
  })();
}

const UPSERT_SHOW = `
INSERT INTO shows (bookId, name, cover, introduction, episodeCount, playCount, tags, status, updatedAt, sourceId)
VALUES (@bookId, @name, @cover, @introduction, @episodeCount, @playCount, @tags, @status, @updatedAt, @sourceId)
ON CONFLICT(bookId) DO UPDATE SET
  name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE shows.name END,
  cover = CASE WHEN excluded.cover <> '' THEN excluded.cover ELSE shows.cover END,
  introduction = CASE WHEN excluded.introduction <> '' THEN excluded.introduction ELSE shows.introduction END,
  episodeCount = CASE WHEN excluded.episodeCount > 0 THEN excluded.episodeCount ELSE shows.episodeCount END,
  playCount = CASE WHEN excluded.playCount <> '' THEN excluded.playCount ELSE shows.playCount END,
  tags = CASE WHEN excluded.tags <> '[]' THEN excluded.tags ELSE shows.tags END,
  status = COALESCE(excluded.status, shows.status),
  updatedAt = excluded.updatedAt,
  sourceId = COALESCE(excluded.sourceId, shows.sourceId)
`;

// `tags` is a JSON array string; brackets and quotes are blanked so each tag indexes as words.
function tagsText(alias) {
  return `replace(replace(replace(${alias}.tags, '[', ' '), ']', ' '), '"', ' ')`;
}

const FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS shows_fts USING fts5(name, tags, introduction, content='shows', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS shows_fts_ai AFTER INSERT ON shows BEGIN
  INSERT INTO shows_fts(rowid, name, tags, introduction)
  VALUES (new.rowid, new.name, ${tagsText('new')}, new.introduction);
END;
CREATE TRIGGER IF NOT EXISTS shows_fts_ad AFTER DELETE ON shows BEGIN
  INSERT INTO shows_fts(shows_fts, rowid, name, tags, introduction)
  VALUES ('delete', old.rowid, old.name, ${tagsText('old')}, old.introduction);
END;
CREATE TRIGGER IF NOT EXISTS shows_fts_au AFTER UPDATE ON shows BEGIN
  INSERT INTO shows_fts(shows_fts, rowid, name, tags, introduction)
  VALUES ('delete', old.rowid, old.name, ${tagsText('old')}, old.introduction);
  INSERT INTO shows_fts(rowid, name, tags, introduction)
  VALUES (new.rowid, new.name, ${tagsText('new')}, new.introduction);
END;
`;

// Returns false (search falls back to LIKE) when FTS5 is unavailable. Rebuilds the index
// when it does not cover every show, which is the case on first start after the upgrade.
function setupSearchIndex(raw) {
  try {
    raw.transaction(() => raw.exec(FTS_SCHEMA))();
    const shows = raw.prepare('SELECT COUNT(*) AS n FROM shows').get().n;
    const indexed = raw.prepare('SELECT COUNT(*) AS n FROM shows_fts_docsize').get().n;
    if (shows !== indexed) raw.exec("INSERT INTO shows_fts(shows_fts) VALUES('rebuild')");
    return true;
  } catch (err) {
    console.warn(`Search index unavailable, using LIKE search: ${err.message}`);
    return false;
  }
}

export function queryTokens(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function sourceNameMap() {
  return new Map((getConfig().sources || []).map((s) => [s.id, s.name]));
}

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
    source: row.sourceId ?? null,
  };
}

// Before the shared DramaBuzz key was made key-only, DramaBox shows were written with the
// DramaBuzz source id, and some DramaBox rows never got one. Both fixes are idempotent.
const DRAMABOX_ID_GLOB = '4[12]000[0-9]*';

function repairShowSources(raw) {
  const relabel = raw.prepare("UPDATE shows SET sourceId = 'dramabox' WHERE sourceId = 'dramabuzz'");
  const fillNull = raw.prepare(`UPDATE shows SET sourceId = 'dramabox'
    WHERE sourceId IS NULL AND bookId GLOB '${DRAMABOX_ID_GLOB}' AND length(bookId) = 11`);
  return raw.transaction(() => ({
    relabelled: relabel.run().changes,
    filled: fillNull.run().changes,
  }))();
}

export function openDb(dataDir, { legacyPasswordHash = '' } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const raw = new Database(path.join(dataDir, 'library.db'));
  raw.pragma('journal_mode = WAL');
  dropRemovedTables(raw);
  raw.exec(SCHEMA);
  ensureColumns(raw);
  dropGlobalProfileNameUnique(raw);
  migrateAccounts(raw, legacyPasswordHash);
  const ftsReady = setupSearchIndex(raw);

  const upsert = raw.prepare(UPSERT_SHOW);
  const getShowStmt = raw.prepare('SELECT * FROM shows WHERE bookId = ?');
  const showsBySourceStmt = raw.prepare('SELECT * FROM shows WHERE sourceId = ? ORDER BY updatedAt DESC LIMIT ?');

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
        sourceId: s.source || null,
      });
    }
  });

  return {
    raw,
    upsertShows,
    repairShowSources() {
      return repairShowSources(raw);
    },
    getShow(bookId) {
      const row = getShowStmt.get(String(bookId));
      return row ? toShow(row) : null;
    },
    showsBySource(sourceId, limit = 500) {
      return showsBySourceStmt.all(String(sourceId), limit).map(toShow);
    },
    searchLocal(q, { limit = 20, sourceId } = {}) {
      const tokens = queryTokens(q);
      if (!tokens.length) return [];
      const params = [];
      const where = [];
      if (ftsReady) {
        where.push('shows_fts MATCH ?');
        params.push(tokens.map((t) => `"${t}"*`).join(' AND '));
      } else {
        for (const t of tokens) {
          const like = `%${escapeLike(t)}%`;
          where.push("(s.name LIKE ? ESCAPE '\\' OR s.tags LIKE ? ESCAPE '\\' OR s.introduction LIKE ? ESCAPE '\\')");
          params.push(like, like, like);
        }
      }
      if (sourceId) {
        where.push('s.sourceId = ?');
        params.push(String(sourceId));
      }
      // Titles containing the typed phrase beat word-by-word matches ("he bro" should find
      // "He Broke…" before "My Three Brothers…"), then bm25 / recency decides.
      const phrase = escapeLike(tokens.join(' ').toLowerCase());
      const phraseRank = `CASE WHEN lower(s.name) LIKE ? ESCAPE '\\' THEN 0
        WHEN lower(s.name) LIKE ? ESCAPE '\\' THEN 1
        WHEN lower(s.name) LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END`;
      const order = `${phraseRank}, ${ftsReady ? 'bm25(shows_fts, 10.0, 3.0, 1.0)' : 's.updatedAt DESC'}`;
      const from = ftsReady
        ? 'shows_fts JOIN shows s ON s.rowid = shows_fts.rowid'
        : 'shows s';
      const rows = raw.prepare(`SELECT s.* FROM ${from} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`)
        .all(...params, `${phrase}%`, `% ${phrase}%`, `%${phrase}%`, limit);
      const names = sourceNameMap();
      return rows.map((row) => ({ ...toShow(row), sourceName: names.get(row.sourceId) ?? null }));
    },
    matchingTags(q, limit = 3) {
      const needle = String(q || '').trim().toLowerCase();
      if (needle.length < 2) return [];
      return raw.prepare(`
        SELECT name, count FROM (
          SELECT MIN(trim(j.value)) AS name, lower(trim(j.value)) AS key, COUNT(DISTINCT s.bookId) AS count
          FROM shows s, json_each(s.tags) j
          WHERE typeof(j.value) = 'text' AND lower(trim(j.value)) LIKE ? ESCAPE '\\'
          GROUP BY lower(trim(j.value))
        )
        ORDER BY CASE WHEN key LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, count DESC, name
        LIMIT ?
      `).all(`%${escapeLike(needle)}%`, `${escapeLike(needle)}%`, limit);
    },
  };
}
