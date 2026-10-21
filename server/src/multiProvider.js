import { getConfig, isKeyOnly } from './config.js';
import { normalizeShow } from './normalize.js';
import { httpError } from './errors.js';
import {
  platformChapters,
  platformLatest,
  platformSearch,
  platformStreamUrl,
} from './goodbosPlatforms.js';

const CHAPTER_TTL_MS = 10 * 60 * 1000;
const CHAPTER_CACHE_MAX = 200;
const chapterCache = new Map();
const chaptersInFlight = new Map();

function pruneChapterCache() {
  if (chapterCache.size <= CHAPTER_CACHE_MAX) return;
  const oldest = [...chapterCache.entries()]
    .sort((a, b) => a[1].at - b[1].at)
    .slice(0, chapterCache.size - CHAPTER_CACHE_MAX);
  for (const [key] of oldest) chapterCache.delete(key);
}

async function fetchPlatformChapters(source, bookId, opts, fresh = false) {
  const key = `${source.id}:${bookId}:${opts.quality || 720}`;
  if (!fresh) {
    const cached = chapterCache.get(key);
    if (cached && Date.now() - cached.at < CHAPTER_TTL_MS) return cached.raw;
    const pending = chaptersInFlight.get(key);
    if (pending) return pending;
  }

  const promise = (async () => {
    const data = await platformChapters(source, bookId, opts);
    chapterCache.set(key, { at: Date.now(), raw: data });
    pruneChapterCache();
    return data;
  })().finally(() => chaptersInFlight.delete(key));

  chaptersInFlight.set(key, promise);
  return promise;
}

function firstCdnUrl(cdnList) {
  for (const cdn of cdnList || []) {
    const url = cdn.url || cdn.videoUrl || cdn.mp4 || cdn.playUrl;
    if (url) return url;
  }
  return null;
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

function sharedApiKey() {
  const cfg = getConfig();
  const shared = (cfg.sources || []).find((s) => s.type === 'dramabuzz' && s.config?.apiKey);
  return shared?.config?.apiKey || '';
}

function sourceApiKey(source) {
  return source.config?.apiKey || (source.type === 'goodbos' ? sharedApiKey() : '');
}

export function createMultiProvider({ mock, port, language, requestDelay, resolveShowSource }) {
  let upstream = { ok: true, at: null };
  const lang = language || 'en';

  function quality() {
    return Number(getConfig().quality) || 720;
  }

  function record(ok, err) {
    const at = new Date().toISOString();
    upstream = ok ? { ok: true, at } : { ok: false, error: String(err?.message || err), at };
  }

  function getActiveSource() {
    const cfg = getConfig();
    const sources = (cfg.sources || []).filter((s) => !isKeyOnly(s));
    const id = cfg.activeSourceId;
    return sources.find((s) => s.id === id)
      || sources.find((s) => s.id === 'dramabox' && s.enabled)
      || sources.find((s) => s.enabled)
      || sources[0];
  }

  function getSource(sourceId) {
    const cfg = getConfig();
    const found = sourceId
      ? (cfg.sources || []).find((s) => s.id === sourceId && !isKeyOnly(s))
      : null;
    return found || getActiveSource();
  }

  function tagItems(source, result) {
    const items = (result?.items || []).map((s) => ({ ...s, source: source.id, sourceName: source.name }));
    return { ...result, items };
  }

  function showSourceId(bookId, sourceId) {
    return sourceId || resolveShowSource?.(bookId) || undefined;
  }

  async function withSource(fn, sourceId) {
    const source = getSource(sourceId);
    if (!source) throw httpError(503, 'No source configured');
    // Only the active source drives the upstream banner; a down secondary
    // platform on the home page shouldn't claim the whole API is unreachable.
    const isActive = source.id === getActiveSource()?.id;
    try {
      const value = await fn(source);
      if (isActive) record(true);
      return value;
    } catch (err) {
      if (isActive) record(false, err);
      throw err;
    }
  }

  async function latest(page = 1, { sourceId } = {}) {
    return withSource(async (source) => tagItems(source, await fetchLatest(source, page)), sourceId);
  }

  async function fetchLatest(source, page) {
    if (source.type === 'goodbos') {
      return platformLatest(source, {
        page,
        lang,
        apiKey: sourceApiKey(source),
        quality: quality(),
      });
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
  }

  async function search(q, page = 1, { sourceId } = {}) {
    return withSource(async (source) => tagItems(source, await fetchSearch(source, q, page)), sourceId);
  }

  async function fetchSearch(source, q, page) {
    if (source.type === 'goodbos') {
      return platformSearch(source, {
        q,
        page,
        lang,
        apiKey: sourceApiKey(source),
        quality: quality(),
      });
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
  }

  async function chapters(bookId, { fresh = false, sourceId } = {}) {
    return withSource(async (source) => {
      if (source.type === 'goodbos') {
        return fetchPlatformChapters(
          source,
          bookId,
          { lang, apiKey: sourceApiKey(source), quality: quality() },
          fresh,
        );
      }
      return { bookId: String(bookId), totalChapters: 0, chapters: [] };
    }, showSourceId(bookId, sourceId));
  }

  async function streamUrl(bookId, index, { sourceId } = {}) {
    return withSource(async (source) => {
      if (source.type === 'goodbos') {
        const data = await fetchPlatformChapters(source, bookId, {
          lang,
          apiKey: sourceApiKey(source),
          quality: quality(),
        });
        const ep = data.chapters.find((c) => c.index === Number(index));
        const direct = ep?.videoUrl || firstCdnUrl(ep?.cdnList);
        if (direct) return direct;
        return platformStreamUrl(source, bookId, index, {
          lang,
          apiKey: sourceApiKey(source),
          quality: quality(),
        });
      }
      throw httpError(501, 'Stream URL not implemented for this source');
    }, showSourceId(bookId, sourceId));
  }

  return {
    mock,

    setOptions() {},
    setActiveSource() {},

    health() {
      return { ...upstream };
    },

    listEnabledSources() {
      return (getConfig().sources || [])
        .filter((s) => s.enabled && !isKeyOnly(s))
        .map(({ id, name, type }) => ({ id, name, type }));
    },

    latest,
    trending: async (opts) => (await latest(1, opts)).items,
    forYou: () => withSource(async () => []),
    recommended: () => withSource(async () => []),
    comingSoon: () => withSource(async () => []),
    dubIndo: () => withSource(async () => []),
    vip: () => withSource(async () => []),
    search,
    suggest: async (q) => (await search(q, 1)).items.slice(0, 8),
    chapters,
    streamUrl,
  };
}
