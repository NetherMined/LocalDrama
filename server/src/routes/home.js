import { getConfig, isKeyOnly } from '../config.js';
import { parseCount } from '../normalize.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCE_TIMEOUT_MS = 20 * 1000;
const SOURCE_CONCURRENCY = 3;
const ROW_SIZE = 24;
const GENRE_ROWS = 3;
const GENRE_MIN_SHOWS = 6;
const POPULAR_MIN_COUNTS = 6;
const FEATURED_COUNT = 5;
const HOT_COUNT = 10;
const NEW_PER_PLATFORM = 2;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function showKey(show) {
  return `${show.source}:${show.bookId}`;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((s) => {
    const key = showKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function interleave(lists) {
  const out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (list[i]) out.push(list[i]);
    }
  }
  return dedupe(out);
}

function slugify(key) {
  return key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || encodeURIComponent(key);
}

export function registerHomeRoutes(app, ctx) {
  const { db, provider } = ctx;
  let cache = null;
  const sourceCache = new Map();

  async function fetchSourceLatest(source, errors, refresh) {
    const cached = sourceCache.get(source.id);
    if (!refresh && cached && Date.now() - cached.at < SOURCE_CACHE_TTL_MS) return cached.items;
    try {
      const res = await withTimeout(provider.latest(1, { sourceId: source.id }), SOURCE_TIMEOUT_MS);
      const items = res?.items || [];
      sourceCache.set(source.id, { at: Date.now(), items });
      return items;
    } catch (err) {
      errors.push({ key: source.id, error: String(err?.message || err) });
      return [];
    }
  }

  function guestView(value, req) {
    return req.account ? value : { ...value, errors: [] };
  }

  async function build(refresh) {
    const cfg = getConfig();
    const rows = [];
    const errors = [];
    const enabled = provider.listEnabledSources();

    const fetched = (await mapPool(enabled, SOURCE_CONCURRENCY, async (source) => ({
      source,
      items: await fetchSourceLatest(source, errors, refresh),
    }))).filter((f) => f.items.length);

    const all = fetched.flatMap((f) => f.items);
    if (all.length) db.upsertShows(all);

    const active = fetched.find((f) => f.source.id === cfg.activeSourceId);
    if (active) {
      rows.push({
        key: `latest-${active.source.id}`,
        title: `${active.source.name} Originals`,
        source: active.source.id,
        items: active.items.slice(0, ROW_SIZE),
      });
    }
    for (const f of fetched) {
      if (f === active) continue;
      rows.push({
        key: `latest-${f.source.id}`,
        title: f.source.name,
        source: f.source.id,
        items: f.items.slice(0, ROW_SIZE),
      });
    }

    const trending = interleave(fetched.map((f) => f.items)).slice(0, ROW_SIZE);
    if (trending.length) {
      rows.push({ key: 'trending', title: 'Trending Now', source: cfg.activeSourceId, items: trending });
    }

    const unique = dedupe(all);
    const byPlays = (a, b) => parseCount(b.playCount) - parseCount(a.playCount);
    const hotKeys = new Set(
      unique.filter((s) => parseCount(s.playCount) > 0).sort(byPlays).slice(0, HOT_COUNT).map(showKey),
    );
    const newKeys = new Set(fetched.flatMap((f) => f.items.slice(0, NEW_PER_PLATFORM).map(showKey)));
    const badged = (s) => {
      const key = showKey(s);
      return { ...s, badge: hotKeys.has(key) ? 'Hot' : newKeys.has(key) ? 'New' : null };
    };
    const withPlays = unique.filter((s) => parseCount(s.playCount) > 0);
    if (withPlays.length >= POPULAR_MIN_COUNTS) {
      const popular = [...unique]
        .sort(byPlays)
        .slice(0, ROW_SIZE);
      rows.push({ key: 'new-popular', title: 'New & Popular', items: popular });
    }

    const tagCounts = new Map();
    for (const show of unique) {
      const seen = new Set();
      for (const tag of show.tags || []) {
        const name = String(tag).trim();
        const key = name.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const entry = tagCounts.get(key);
        if (entry) entry.count += 1;
        else tagCounts.set(key, { key, name, count: 1 });
      }
    }
    const genres = [...tagCounts.values()]
      .filter((t) => t.count >= GENRE_MIN_SHOWS)
      .sort((a, b) => b.count - a.count)
      .slice(0, GENRE_ROWS);
    for (const genre of genres) {
      const items = unique
        .filter((s) => (s.tags || []).some((t) => String(t).toLowerCase() === genre.key))
        .slice(0, ROW_SIZE);
      rows.push({ key: `genre-${slugify(genre.key)}`, title: genre.name, items });
    }

    for (const row of rows) row.items = row.items.map(badged);

    // The same series is often listed by several platforms, so the slider dedupes by title too.
    const featuredNames = new Set();
    const featured = unique
      .filter((s) => s.cover)
      .sort((a, b) => byPlays(a, b) || (b.introduction ? 1 : 0) - (a.introduction ? 1 : 0))
      .filter((s) => {
        const name = String(s.name || '').trim().toLowerCase();
        if (featuredNames.has(name)) return false;
        featuredNames.add(name);
        return true;
      })
      .slice(0, FEATURED_COUNT)
      .map(badged);

    const heroPick = (items) => items?.find((s) => s.cover && s.introduction);
    const heroRow = rows.find((r) => r.key === `latest-${cfg.activeSourceId}`);
    const hero = featured[0]
      ?? heroPick(heroRow?.items)
      ?? rows.map((r) => heroPick(r.items)).find(Boolean)
      ?? rows[0]?.items?.[0]
      ?? null;

    return {
      hero,
      featured,
      rows,
      errors,
      activeSourceId: cfg.activeSourceId,
      sources: enabled,
    };
  }

  app.get('/api/home', async (req) => {
    // A refresh re-fetches every platform, so only signed-in users can ask for one.
    const refresh = !!req.account && req.query.refresh === '1';
    const cfg = getConfig();
    // Switching sources or toggling platforms must not serve the old home
    // payload for five minutes.
    const signature = [
      cfg.activeSourceId,
      ...(cfg.sources || []).filter((s) => s.enabled && !isKeyOnly(s)).map((s) => s.id),
    ].join('|');
    if (!refresh && cache && cache.signature === signature && Date.now() - cache.at < CACHE_TTL_MS) {
      return guestView(cache.value, req);
    }
    const value = await build(refresh);
    cache = { at: Date.now(), value, signature };
    return guestView(value, req);
  });
}
