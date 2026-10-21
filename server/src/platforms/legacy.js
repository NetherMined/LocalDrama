import { httpError } from '../errors.js';
import { normalizeShow } from '../normalize.js';
import { parseTags, stripHtml } from './common.js';

function mapNetShort(item) {
  return normalizeShow({
    bookId: item.shortPlayId || item.shortPlayLibraryId || item.id,
    bookName: stripHtml(item.shortPlayName || item.name),
    coverWap: item.shortPlayCover || item.cover,
    introduction: item.shortPlayIntroduction || item.introduction || item.remark || '',
    chapterCount: item.totalEpisode || item.chapterCount || 0,
    playCount: item.heatScoreShow || item.playCount || '',
    tagV3s: item.labelArray || item.labelNameList || parseTags(item.shortPlayLabels || item.labelNames),
  });
}

function mapDramaBox(item) {
  return normalizeShow({
    bookId: item.bookId || item.id,
    bookName: item.bookName || item.title || item.name,
    coverWap: item.coverWap || item.cover || '',
    introduction: item.introduction || item.synopsis || '',
    chapterCount: item.chapterCount || item.episodes || 0,
    playCount: item.playCount || 0,
    tagV3s: item.tagV3s || item.tags || item.genre || [],
  });
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.bookId || seen.has(item.bookId)) return false;
    seen.add(item.bookId);
    return true;
  });
}

function firstCdnUrl(cdnList) {
  for (const cdn of cdnList || []) {
    const url = cdn.url || cdn.videoUrl || cdn.mp4 || cdn.playUrl;
    if (url) return url;
  }
  return null;
}

export const netShort = {
  id: 'netshort',
  host: 'netshort.goodbos.online',
  label: 'NetShort',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request(`/api/home/${page}`, { lang: ctx.lang });
    const raw = data?.data?.contentInfos;
    const items = dedupe((Array.isArray(raw) ? raw : []).map(mapNetShort));
    return { items, hasMore: items.length >= 20 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/search', { q, page, lang: ctx.lang });
    const raw = data?.data?.searchCodeSearchResult;
    const items = dedupe((Array.isArray(raw) ? raw : []).map(mapNetShort));
    const total = Number(data?.data?.total);
    return { items, hasMore: Number.isFinite(total) ? page * 20 < total : items.length >= 20 };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(`/api/drama/${encodeURIComponent(bookId)}`, { lang: ctx.lang });
    const detail = data?.data || {};
    const raw = Array.isArray(detail.shortPlayEpisodeList) ? detail.shortPlayEpisodeList : [];
    const chapters = raw.map((ep, i) => {
      const no = Number(ep.episodeNo);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return {
        index,
        chapterId: String(ep.episodeId || ep.id || i),
        name: stripHtml(ep.episodeName || ep.name) || `Episode ${index + 1}`,
        cdnList: [],
      };
    });
    chapters.sort((a, b) => a.index - b.index);
    return {
      bookId: String(bookId),
      totalChapters: Number(detail.totalEpisode) || chapters.length,
      chapters,
    };
  },

  async streamUrl(ctx, bookId, index) {
    if (!ctx.apiKey) throw httpError(400, 'API key / token is required to play episodes');
    const ep = Number(index) + 1;
    const data = await ctx.request(
      `/api/watch/${encodeURIComponent(bookId)}/${ep}`,
      { lang: ctx.lang, code: ctx.apiKey },
    );
    const url = data?.data?.videoUrl || data?.data?.playUrl || data?.data?.url;
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    const data = await ctx.request('/api/home/1', { lang: ctx.lang });
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const first = data?.data?.contentInfos?.[0];
    if (first?.shortPlayId) {
      await ctx.request(`/api/watch/${encodeURIComponent(first.shortPlayId)}/1`, {
        lang: ctx.lang,
        code: ctx.apiKey,
      });
    }
    return { ok: true };
  },
};

const EXPAND_STOP_WORDS = new Set([
  'the', 'and', 'with', 'from', 'that', 'this', 'your', 'his', 'her', 'for',
  'who', 'was', 'are', 'not', 'but', 'into', 'over', 'after', 'when',
]);
const EXPAND_MAX_QUERIES = 4;
const EXPAND_CACHE_TTL_MS = 10 * 60 * 1000;
const EXPAND_CACHE_MAX = 200;
const expandCache = new Map();

function queryWords(q) {
  return String(q || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// Capped upstream searches return the same ~12 hits for a long query, so each
// distinct word and the first two words are searched too and the results merged.
function expandedQueries(q) {
  const full = String(q || '').trim().replace(/\s+/g, ' ');
  const queries = [full];
  const words = queryWords(full);
  if (words.length < 2) return queries;
  const candidates = [
    ...words.filter((w) => w.length >= 4 && !EXPAND_STOP_WORDS.has(w)),
    words.slice(0, 2).join(' '),
  ];
  for (const candidate of candidates) {
    if (queries.length >= EXPAND_MAX_QUERIES) break;
    if (!queries.some((existing) => existing.toLowerCase() === candidate)) queries.push(candidate);
  }
  return queries;
}

function expandCacheGet(key) {
  const hit = expandCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > EXPAND_CACHE_TTL_MS) {
    expandCache.delete(key);
    return null;
  }
  return hit.items;
}

function expandCacheSet(key, items) {
  if (!expandCache.has(key) && expandCache.size >= EXPAND_CACHE_MAX) {
    expandCache.delete(expandCache.keys().next().value);
  }
  expandCache.set(key, { at: Date.now(), items });
}

async function cachedSearch(lang, query, fetchOne) {
  const key = `${lang}\u0000${query.toLowerCase()}`;
  const hit = expandCacheGet(key);
  if (hit) return hit;
  const items = await fetchOne(query);
  expandCacheSet(key, items);
  return items;
}

async function expandedSearch(ctx, q, fetchOne) {
  const queries = expandedQueries(q);
  const outcomes = await Promise.allSettled(
    queries.map((query) => cachedSearch(ctx.lang, query, fetchOne)),
  );
  const failures = outcomes.filter((o) => o.status === 'rejected');
  if (failures.length === outcomes.length) throw failures[0].reason;

  const merged = new Map();
  outcomes.forEach((outcome, index) => {
    if (outcome.status !== 'fulfilled') return;
    for (const item of outcome.value) {
      if (!item.bookId) continue;
      const id = String(item.bookId);
      const entry = merged.get(id);
      if (entry) {
        if (index === 0) entry.fromFull = true;
      } else {
        merged.set(id, { item, fromFull: index === 0 });
      }
    }
  });

  const phrase = queries[0].toLowerCase();
  const words = [...new Set(queryWords(queries[0]))];
  const ranked = [...merged.values()].map(({ item, fromFull }) => {
    const title = String(item.name || '').toLowerCase();
    let score = 0;
    if (title.includes(phrase)) score += 3;
    for (const word of words) if (title.includes(word)) score += 1;
    if (fromFull) score += 1;
    return { item, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return { items: ranked.map((r) => r.item), hasMore: false };
}

const DRAMABOX_FEEDS = ['/api/dramabox/trending', '/api/dramabox/latest', '/api/dramabox/foryou'];

function unwrapList(data) {
  const raw = Array.isArray(data) ? data : data?.data || data?.results || data?.items || [];
  return Array.isArray(raw) ? raw : [];
}

export const dramaBox = {
  id: 'dramabox',
  host: 'dramabox.goodbos.online',
  label: 'DramaBox',

  async latest(ctx, { page = 1 } = {}) {
    // The upstream feeds ignore `page` (page 2 repeats page 1), so there is only one page.
    if (page > 1) return { items: [], hasMore: false };
    const feeds = await Promise.allSettled(
      DRAMABOX_FEEDS.map((path) => ctx.request(path, { lang: ctx.lang, page: 1 })),
    );
    if (feeds.every((f) => f.status === 'rejected')) throw feeds[0].reason;
    const raw = feeds.flatMap((f) => (f.status === 'fulfilled' ? unwrapList(f.value) : []));
    return { items: dedupe(raw.map(mapDramaBox)), hasMore: false };
  },

  expandSearch: true,

  async search(ctx, { q, page = 1 } = {}) {
    if (page > 1) return { items: [], hasMore: false };
    const fetchOne = async (query) => {
      const data = await ctx.request('/api/dramabox/search', { query, lang: ctx.lang, page: 1 });
      return dedupe(unwrapList(data).map(mapDramaBox));
    };
    if (this.expandSearch) return expandedSearch(ctx, q, fetchOne);
    return { items: await fetchOne(q), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request('/api/dramabox/allepisode', { bookId });
    const raw = Array.isArray(data) ? data : data.data || [];
    const chapters = raw.map((c, i) => ({
      index: Number(c.chapterIndex ?? c.index ?? i),
      chapterId: String(c.chapterId || c.id || i),
      name: String(c.chapterName || c.name || `Episode ${i + 1}`).trim(),
      cdnList: Array.isArray(c.cdnList) ? c.cdnList : [],
      videoUrl: c.videoUrl || c.mp4 || c.video?.mp4 || null,
    }));
    chapters.sort((a, b) => a.index - b.index);
    return { bookId: String(bookId), totalChapters: chapters.length, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    const url = ep?.videoUrl || firstCdnUrl(ep?.cdnList);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required' };
    await ctx.request('/api/dramabox/trending', { lang: ctx.lang, page: 1 });
    return { ok: true };
  },
};
