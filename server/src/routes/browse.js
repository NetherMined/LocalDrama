import fs from 'node:fs';
import { getConfig } from '../config.js';
import { httpError } from '../errors.js';
import { isHlsUrl } from '../platforms/common.js';
import { parseCount } from '../normalize.js';

const CATEGORY_LIMIT = 30;
const CATEGORY_MIN_CACHED = 10;

const SORTERS = new Map([
  ['popular', (a, b) => parseCount(b.playCount) - parseCount(a.playCount)],
  ['name', (a, b) => String(a.name || '').localeCompare(String(b.name || ''))],
  ['episodes', (a, b) => (b.episodeCount || 0) - (a.episodeCount || 0)],
]);

function pageParam(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function optionalSource(value) {
  return String(value || '') || undefined;
}

function resolveSourceId(source) {
  return source || getConfig().activeSourceId || null;
}

function sourceName(id) {
  return (getConfig().sources || []).find((s) => s.id === id)?.name || null;
}

function hasTag(show, tagKey) {
  return (show.tags || []).some((t) => String(t).toLowerCase() === tagKey);
}

export function registerBrowseRoutes(app, ctx) {
  const { db, provider } = ctx;

  app.get('/api/browse/latest', async (req) => {
    const page = pageParam(req.query.page);
    const source = optionalSource(req.query.source);
    const resolved = resolveSourceId(source);
    const result = await provider.latest(page, { sourceId: source || undefined });
    const fetched = result.items || [];
    db.upsertShows(fetched);

    let items = fetched;
    const tag = String(req.query.tag || '').trim().toLowerCase();
    if (tag) {
      items = items.filter((s) => hasTag(s, tag));
      if (page === 1) {
        const seen = new Set(items.map((s) => s.bookId));
        const name = sourceName(resolved);
        const cached = db.showsBySource(resolved)
          .filter((s) => hasTag(s, tag) && !seen.has(s.bookId))
          .map((s) => ({ ...s, source: resolved, sourceName: name }));
        items = [...items, ...cached];
      }
    }

    const sorter = SORTERS.get(String(req.query.sort || ''));
    if (sorter) items = [...items].sort(sorter);

    return { items, hasMore: !!result.hasMore, source: resolved };
  });

  app.get('/api/browse/categories', async (req) => {
    const source = optionalSource(req.query.source);
    const resolved = resolveSourceId(source);

    let shows = db.showsBySource(resolved);
    if (shows.length < CATEGORY_MIN_CACHED) {
      const { items } = await provider.latest(1, { sourceId: source });
      db.upsertShows(items || []);
      shows = db.showsBySource(resolved);
    }

    const counts = new Map();
    for (const show of shows) {
      const seen = new Set();
      for (const tag of show.tags || []) {
        const name = String(tag).trim();
        const key = name.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const entry = counts.get(key);
        if (entry) entry.count += 1;
        else counts.set(key, { name, count: 1 });
      }
    }

    const categories = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, CATEGORY_LIMIT);

    return { source: resolved, categories };
  });

  app.get('/api/browse/sources', async () => ({
    activeSourceId: getConfig().activeSourceId,
    sources: provider.listEnabledSources(),
  }));

  app.get('/api/search', async (req) => {
    const q = String(req.query.q || '').trim();
    if (!q) throw httpError(400, 'q is required');
    const { items, hasMore } = await provider.search(q, pageParam(req.query.page), { sourceId: optionalSource(req.query.source) });
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
    const sourceId = optionalSource(req.query.source);
    const { chapters } = await provider.chapters(bookId, { sourceId });

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

    return { show, source: sourceId ?? show?.source ?? null, episodes };
  });

  app.get('/api/shows/:bookId/stream/:index', async (req) => {
    const bookId = String(req.params.bookId);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) throw httpError(400, 'Invalid episode index');
    const url = await provider.streamUrl(bookId, index, { sourceId: optionalSource(req.query.source) });
    const hls = isHlsUrl(url);
    return {
      url: hls ? `/api/hls?url=${encodeURIComponent(url)}` : url,
      hls,
    };
  });
}
