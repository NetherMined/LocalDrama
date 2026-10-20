import { getConfig } from './config.js';
import { normalizeShow } from './normalize.js';
import { httpError } from './errors.js';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [750, 2000];
const CHAPTER_TTL_MS = 10 * 60 * 1000;
const CHAPTER_CACHE_MAX = 200;
const chapterCache = new Map();
const chaptersInFlight = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function goodbosRequest(base, path, apiKey, params = {}) {
  if (!apiKey) throw httpError(400, 'API key / token is required');
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-token': apiKey,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 LocalDrama/0.1',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const message = `GoodBos HTTP ${res.status}${text ? `: ${text.slice(0, 100)}` : ''}`;
        if (RETRYABLE_STATUS.has(res.status) && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw httpError(502, message);
      }
      return await res.json();
    } catch (err) {
      if (err.statusCode || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function pruneChapterCache() {
  if (chapterCache.size <= CHAPTER_CACHE_MAX) return;
  const oldest = [...chapterCache.entries()]
    .sort((a, b) => a[1].at - b[1].at)
    .slice(0, chapterCache.size - CHAPTER_CACHE_MAX);
  for (const [key] of oldest) chapterCache.delete(key);
}

// The episode list is identical for every request of a show, so cache it briefly.
// Without this, a queue of N episodes hits the upstream API N times and triggers 503s.
async function fetchEpisodes(source, bookId, fresh = false) {
  const key = `${source.id}:${bookId}`;
  if (!fresh) {
    const cached = chapterCache.get(key);
    if (cached && Date.now() - cached.at < CHAPTER_TTL_MS) return cached.raw;
    const pending = chaptersInFlight.get(key);
    if (pending) return pending;
  }

  const promise = (async () => {
    const data = await goodbosRequest(
      'https://dramabox.goodbos.online',
      '/api/dramabox/allepisode',
      source.config.apiKey,
      { bookId },
    );
    const raw = Array.isArray(data) ? data : (data.data || []);
    chapterCache.set(key, { at: Date.now(), raw });
    pruneChapterCache();
    return raw;
  })().finally(() => chaptersInFlight.delete(key));

  chaptersInFlight.set(key, promise);
  return promise;
}

// GoodBos returns a 0-based chapterIndex, which matches the rest of the app.
// Using `||` here would turn chapter 0 into 1 and drop episode 1 from "Download all".
function chapterNumber(item, fallback) {
  return Number(item.chapterIndex ?? item.index ?? fallback);
}

function mapItem(item) {
  return normalizeShow({
    bookId: String(item.bookId || item.id || ''),
    bookName: item.bookName || item.title || item.name || 'Untitled',
    coverWap: item.coverWap || item.cover || '',
    introduction: item.introduction || item.synopsis || '',
    chapterCount: Number(item.chapterCount || item.episodes || 0),
    playCount: Number(item.playCount || 0),
    tagV3s: item.tagV3s || item.tags || item.genre || [],
  });
}

export function createMultiProvider({ mock, port, language, requestDelay }) {
  let upstream = { ok: true, at: null };

  function record(ok, err) {
    const at = new Date().toISOString();
    upstream = ok ? { ok: true, at } : { ok: false, error: String(err?.message || err), at };
  }

  function getActiveSource() {
    const cfg = getConfig();
    const id = cfg.activeSourceId;
    return (cfg.sources || []).find((s) => s.id === id) || cfg.sources?.[0];
  }

  async function withSource(fn) {
    const source = getActiveSource();
    if (!source) throw httpError(503, 'No source configured');
    try {
      const value = await fn(source);
      record(true);
      return value;
    } catch (err) {
      record(false, err);
      throw err;
    }
  }

  return {
    mock,

    setOptions() {},
    setActiveSource() {},

    health() {
      return { ...upstream };
    },

    async latest(page = 1) {
      return withSource(async (source) => {
        if (source.type === 'dramabuzz') {
          // Use the DramaBox GoodBos endpoint for latest/trending
          const data = await goodbosRequest(
            'https://dramabox.goodbos.online',
            '/api/dramabox/trending',
            source.config.apiKey,
            { lang: 'en', page },
          );
          const raw = Array.isArray(data) ? data : (data.data || data.results || data.items || []);
          const items = raw.map(mapItem).filter((s) => s.bookId);
          return { items, hasMore: items.length >= 10 };
        }
        if (source.type === 'dramabos') {
          const res = await fetch(`https://dramabos.live/dramabox/api/v1/search?keyword=latest&page=${page}`, {
            headers: { Authorization: `Bearer ${source.config.apiKey}`, Accept: 'application/json' },
          });
          const data = await res.json();
          const items = (data.results || []).map((r) => mapItem({
            bookId: r.id, bookName: r.title, coverWap: r.cover, chapterCount: r.episodes || 0,
          }));
          return { items, hasMore: !!data.hasMore };
        }
        throw httpError(501, `Source type ${source.type} not implemented for latest`);
      });
    },

    trending: () => this.latest(1).then((r) => r.items),
    forYou: () => withSource(async () => []),
    recommended: () => withSource(async () => []),
    comingSoon: () => withSource(async () => []),
    dubIndo: () => withSource(async () => []),
    vip: () => withSource(async () => []),

    async search(q, page = 1) {
      return withSource(async (source) => {
        if (source.type === 'dramabuzz') {
          const data = await goodbosRequest(
            'https://dramabox.goodbos.online',
            '/api/dramabox/search',
            source.config.apiKey,
            { query: q, lang: 'en', page },
          );
          const raw = Array.isArray(data) ? data : (data.data || data.results || data.items || []);
          const items = raw.map(mapItem).filter((s) => s.bookId);
          return { items, hasMore: items.length >= 10 };
        }
        if (source.type === 'dramabos') {
          const res = await fetch(`https://dramabos.live/dramabox/api/v1/search?keyword=${encodeURIComponent(q)}&page=${page}`, {
            headers: { Authorization: `Bearer ${source.config.apiKey}`, Accept: 'application/json' },
          });
          const data = await res.json();
          const items = (data.results || []).map((r) => mapItem({
            bookId: r.id, bookName: r.title, coverWap: r.cover, chapterCount: r.episodes || 0,
          }));
          return { items, hasMore: !!data.hasMore };
        }
        throw httpError(501, `Search not implemented for ${source.type}`);
      });
    },

    async suggest(q) {
      const { items } = await this.search(q, 1);
      return items.slice(0, 8);
    },

    async chapters(bookId, { fresh = false } = {}) {
      return withSource(async (source) => {
        if (source.type === 'dramabuzz') {
          const raw = await fetchEpisodes(source, bookId, fresh);
          return {
            bookId: String(bookId),
            totalChapters: raw.length,
            chapters: raw.map((c, i) => ({
              index: chapterNumber(c, i),
              chapterId: String(c.chapterId || c.id || i),
              name: String(c.chapterName || c.name || `Episode ${i + 1}`).trim(),
              cdnList: c.cdnList || [],
            })),
          };
        }
        return { bookId: String(bookId), totalChapters: 0, chapters: [] };
      });
    },

    async streamUrl(bookId, index) {
      return withSource(async (source) => {
        if (source.type === 'dramabuzz') {
          const raw = await fetchEpisodes(source, bookId);
          const ep = raw.find((c, i) => chapterNumber(c, i) === Number(index));
          const url = ep?.videoUrl || ep?.mp4 || ep?.video?.mp4;
          if (!url) throw httpError(502, 'No stream URL returned for this episode');
          return url;
        }
        throw httpError(501, 'Stream URL not implemented for this source');
      });
    },
  };
}
