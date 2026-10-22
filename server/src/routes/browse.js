import fs from 'node:fs';
import { getConfig } from '../config.js';
import { httpError } from '../errors.js';
import { isHlsUrl } from '../platforms/common.js';
import { parseCount } from '../normalize.js';
import { queryTokens } from '../db.js';
import { hlsProxyUrl } from './hls.js';

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

const SUGGEST_LIMIT = 8;
const SUGGEST_CATEGORY_LIMIT = 3;
const LOCAL_SEARCH_LIMIT = 40;
const UPSTREAM_TIMEOUT_MS = 8000;
const UPSTREAM_CONCURRENCY = 4;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const SEARCH_CACHE_MAX = 100;
const searchCache = new Map();

function searchCacheGet(key) {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return hit.value;
}

function searchCacheSet(key, value) {
  if (!searchCache.has(key) && searchCache.size >= SEARCH_CACHE_MAX) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { at: Date.now(), value });
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(httpError(504, `No response within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function isNameMatch(show, tokens) {
  const words = String(show.name || '').toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}

function interleave(lists) {
  const out = [];
  for (let i = 0; ; i++) {
    let any = false;
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
        any = true;
      }
    }
    if (!any) return out;
  }
}

function dedupe(list) {
  const keys = new Set();
  const bare = new Set();
  const out = [];
  for (const show of list) {
    const id = String(show.bookId);
    if (!show.source) {
      if (bare.has(id)) continue;
      bare.add(id);
    }
    const key = `${show.source || ''}:${id}`;
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(show);
  }
  return out;
}

async function searchFirstPage(ctx, q, source) {
  const { db, provider } = ctx;
  const tokens = queryTokens(q);
  const local = db.searchLocal(q, { limit: LOCAL_SEARCH_LIMIT, sourceId: source });
  const enabled = provider.listEnabledSources();
  const targets = source ? enabled.filter((s) => s.id === source) : enabled;
  const errors = [];
  if (source && targets.length === 0) errors.push({ source, name: source, error: 'Platform is not enabled' });

  const outcomes = await mapLimit(targets, UPSTREAM_CONCURRENCY, async (target) => {
    try {
      const result = await withTimeout(provider.search(q, 1, { sourceId: target.id }), UPSTREAM_TIMEOUT_MS);
      const items = (result.items || [])
        .filter((s) => s.bookId)
        .map((s) => ({ ...s, source: s.source || target.id, sourceName: s.sourceName || target.name }));
      return { target, items };
    } catch (err) {
      return { target, items: [], error: String(err?.message || err) };
    }
  });

  const upstream = [];
  for (const outcome of outcomes) {
    if (outcome.error) errors.push({ source: outcome.target.id, name: outcome.target.name, error: outcome.error });
    upstream.push(...outcome.items);
  }
  db.upsertShows(upstream);

  const nameHits = local.filter((s) => isNameMatch(s, tokens));
  const otherLocal = local.filter((s) => !isNameMatch(s, tokens));
  const merged = dedupe([
    ...nameHits,
    ...interleave(outcomes.map((o) => o.items)),
    ...otherLocal,
  ]);

  const counts = new Map();
  for (const show of merged) {
    const entry = counts.get(show.source) || { id: show.source, name: show.sourceName || show.source, count: 0 };
    entry.count += 1;
    counts.set(show.source, entry);
  }
  const platforms = [...counts.values()]
    .filter((p) => p.id)
    .sort((a, b) => b.count - a.count);

  return { items: merged, hasMore: false, platforms, errors };
}

export function registerBrowseRoutes(app, ctx) {
  const { db, provider, streamTokens } = ctx;

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
    const source = optionalSource(req.query.source);
    const page = pageParam(req.query.page);

    if (page > 1) {
      if (!source) return { items: [], hasMore: false, platforms: [], errors: [] };
      const result = await provider.search(q, page, { sourceId: source });
      const items = result.items || [];
      db.upsertShows(items);
      return { items, hasMore: !!result.hasMore, platforms: [], errors: [] };
    }

    // Instant first paint for the Search page while the platforms are still being asked.
    if (req.query.local === '1') {
      const items = db.searchLocal(q, { limit: LOCAL_SEARCH_LIMIT, sourceId: source });
      return { items, hasMore: false, platforms: [], errors: [] };
    }

    const key = `${q.toLowerCase().replace(/\s+/g, ' ')}|${source || ''}`;
    let value = searchCacheGet(key);
    if (!value) {
      value = await searchFirstPage(ctx, q, source);
      searchCacheSet(key, value);
    }
    return value;
  });

  app.get('/api/search/suggest', async (req) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return { items: [], categories: [] };
    const items = db.searchLocal(q, { limit: SUGGEST_LIMIT }).map((s) => ({
      bookId: s.bookId,
      name: s.name,
      cover: s.cover,
      source: s.source,
      sourceName: s.sourceName,
      tags: s.tags,
    }));
    return { items, categories: db.matchingTags(q, SUGGEST_CATEGORY_LIMIT) };
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

    ctx.follows?.checkBook(bookId, episodes.length);

    return { show, source: sourceId ?? show?.source ?? null, episodes };
  });

  app.get('/api/shows/:bookId/stream/:index', async (req) => {
    const bookId = String(req.params.bookId);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) throw httpError(400, 'Invalid episode index');

    const sourceId = optionalSource(req.query.source);

    const url = await provider.streamUrl(bookId, index, { sourceId });
    const hls = isHlsUrl(url);
    return {
      url: hls ? hlsProxyUrl(url, streamTokens.streamToken(req.account.id)) : url,
      hls,
    };
  });
}
