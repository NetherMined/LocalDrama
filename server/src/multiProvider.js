import { getConfig } from './config.js';
import { normalizeShow } from './normalize.js';
import { httpError } from './errors.js';

const CHAPTER_TTL_MS = 10 * 60 * 1000;

async function dramabuzzRequest(path, apiKey, params = {}) {
  if (!apiKey) throw httpError(400, 'DramaBuzz API key is required');
  const url = new URL(path, 'https://api.dramabuzz.sbs');
  url.searchParams.set('key', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'LocalDrama/0.1' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw httpError(502, `DramaBuzz HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success && data.success !== undefined) throw httpError(502, data.message || 'DramaBuzz request failed');
  return data;
}

function mapDramabuzzItem(item) {
  return normalizeShow({
    bookId: String(item.id || item.bookId || ''),
    bookName: item.title || item.name || 'Untitled',
    coverWap: item.cover || item.coverWap || '',
    introduction: item.synopsis || item.introduction || '',
    chapterCount: item.episodes || item.chapterCount || 0,
    playCount: item.playCount || 0,
    tagV3s: Array.isArray(item.genre) ? item.genre : (item.tags || []),
  });
}

export function createMultiProvider({ mock, port, language, requestDelay }) {
  const chapterCache = new Map();
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

    setOptions() {
      // no-op for now; options are read from config on each call
    },

    setActiveSource() {
      // config is the source of truth
    },

    health() {
      return { ...upstream };
    },

    async latest(page = 1) {
      return withSource(async (source) => {
        if (source.type === 'dramabuzz') {
          // DramaBuzz status endpoint doesn't give a feed; use a search fallback for now
          const data = await dramabuzzRequest('/api/search', source.config.apiKey, { q: 'latest', page });
          const items = (data.results || data.items || []).map(mapDramabuzzItem);
          return { items, hasMore: items.length >= 10 };
        }
        if (source.type === 'dramabos') {
          const res = await fetch(`https://dramabos.live/dramabox/api/v1/search?keyword=latest&page=${page}`, {
            headers: { Authorization: `Bearer ${source.config.apiKey}`, Accept: 'application/json' },
          });
          const data = await res.json();
          const items = (data.results || []).map((r) => normalizeShow({
            bookId: r.id, bookName: r.title, coverWap: r.cover, introduction: '', chapterCount: r.episodes || 0,
          }));
          return { items, hasMore: !!data.hasMore };
        }
        throw httpError(501, `Source type ${source.type} not fully implemented for latest`);
      });
    },

    trending: () => withSource(async () => ({ items: [], hasMore: false })),
    forYou: () => withSource(async () => []),
    recommended: () => withSource(async () => []),
    comingSoon: () => withSource(async () => []),
    dubIndo: () => withSource(async () => []),
    vip: () => withSource(async () => []),

    async search(q, page = 1) {
      return withSource(async (source) => {
        if (source.type === 'dramabuzz') {
          const data = await dramabuzzRequest('/api/search', source.config.apiKey, { q, page });
          const items = (data.results || data.items || []).map(mapDramabuzzItem);
          return { items, hasMore: items.length >= 10 };
        }
        if (source.type === 'dramabos') {
          const res = await fetch(`https://dramabos.live/dramabox/api/v1/search?keyword=${encodeURIComponent(q)}&page=${page}`, {
            headers: { Authorization: `Bearer ${source.config.apiKey}`, Accept: 'application/json' },
          });
          const data = await res.json();
          const items = (data.results || []).map((r) => normalizeShow({
            bookId: r.id, bookName: r.title, coverWap: r.cover, introduction: '', chapterCount: r.episodes || 0,
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

    async chapters(bookId) {
      return withSource(async (source) => {
        // Minimal stub — real episode list depends on platform-specific endpoint
        return {
          bookId: String(bookId),
          totalChapters: 0,
          chapters: [],
        };
      });
    },

    async streamUrl(bookId, index) {
      return withSource(async (source) => {
        throw httpError(501, 'Stream URL resolution for this source is not yet implemented');
      });
    },
  };
}
