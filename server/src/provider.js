import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import DramaboxClient from '@zhadev/dramabox';
import { normalizeShow } from './normalize.js';
import { httpError } from './errors.js';
import { getProxyUrl } from './proxy.js';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const CHAPTER_TTL_MS = 10 * 60 * 1000;
const RETRY_DELAYS_MS = [2000, 4000];
const BLOCKED_MESSAGE = 'Dramabox API refused the request (HTTP 403). It is likely blocked in your region — configure a proxy outside it (setup → Connection, or DRAMABOX_PROXY).';
const BLOCKED_VIA_PROXY_MESSAGE = 'Dramabox API refused the request (HTTP 403) even through the proxy. Datacenter proxy IPs are often blocked (try a residential proxy), or the @zhadev/dramabox client may need an update after a Dramabox API change.';

const fixtureCache = new Map();
function readFixture(name) {
  if (!fixtureCache.has(name)) {
    fixtureCache.set(name, JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf8')));
  }
  return structuredClone(fixtureCache.get(name));
}

function unwrap(res) {
  if (!res || !res.success) {
    const message = String(res?.message || 'Dramabox API request failed');
    if (/403|Access Denied/i.test(message)) throw httpError(502, getProxyUrl() ? BLOCKED_VIA_PROXY_MESSAGE : BLOCKED_MESSAGE);
    throw httpError(502, message);
  }
  return res.data;
}

function listItems(data) {
  if (Array.isArray(data)) return data;
  return data?.results || data?.items || data?.books || [];
}

function isTransient(err) {
  return !/403|Access Denied|blocked|not found/i.test(String(err?.message || ''));
}

function filterByName(items, q, key) {
  const needle = q.toLowerCase();
  const matches = items.filter((it) => String(it[key] || '').toLowerCase().includes(needle));
  return matches.length ? matches : items;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createProvider({ mock, port, language, requestDelay, proxyUrl }) {
  let client = null;
  let opts = { language, requestDelay, proxyUrl };
  const chapterCache = new Map();
  const mockUrl = `http://127.0.0.1:${port}/__mock/sample.mp4`;
  let upstream = { ok: true, at: null };

  function buildClient() {
    // `proxy` is not implemented in @zhadev/dramabox@0.0.2; routing happens in proxy.js via the https.request patch.
    return new DramaboxClient({
      proxy: opts.proxyUrl,
      requestDelay: opts.requestDelay,
      language: opts.language,
      timeout: 45000,
      maxRetries: 3,
      cacheTTL: 300,
    });
  }
  if (!mock) client = buildClient();

  function record(ok, err) {
    const at = new Date().toISOString();
    upstream = ok ? { ok: true, at } : { ok: false, error: String(err?.message || err), at };
  }

  async function call(fn) {
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await fn();
        record(true);
        return value;
      } catch (err) {
        if (attempt >= RETRY_DELAYS_MS.length || !isTransient(err)) {
          record(false, err);
          throw err;
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  function shelf(fixture, load) {
    return call(async () => {
      if (mock) return listItems(readFixture(fixture).data).map(normalizeShow);
      return listItems(unwrap(await load())).map(normalizeShow);
    });
  }

  return {
    mock,

    setOptions(next) {
      const changed = next.language !== opts.language
        || next.requestDelay !== opts.requestDelay
        || next.proxyUrl !== opts.proxyUrl;
      opts = { language: next.language, requestDelay: next.requestDelay, proxyUrl: next.proxyUrl };
      if (changed && !mock) client = buildClient();
    },

    health() {
      return { ...upstream };
    },

    async latest(page = 1) {
      const items = await shelf('getLatest', () => client.getLatest(page));
      return { items, hasMore: mock ? page === 1 : items.length > 0 };
    },

    trending() {
      return shelf('getTrending', () => client.getTrending());
    },

    forYou() {
      return shelf('getForYou', () => client.getForYou(1));
    },

    recommended() {
      return shelf('getRecommendedBooks', () => client.getRecommendedBooks());
    },

    comingSoon() {
      return shelf('getComingSoon', () => client.getComingSoon());
    },

    dubIndo() {
      return shelf('getDubIndo', () => client.getDubIndo('terpopuler', 1, 20));
    },

    async search(q, page = 1) {
      if (mock) {
        const data = readFixture('searchDrama').data;
        const items = filterByName(data.book.map(normalizeShow), q, 'name');
        return { items, hasMore: page === 1 && !!data.isMore };
      }
      return call(async () => {
        const data = unwrap(await client.searchDrama(q, page));
        return { items: (data.book || []).map(normalizeShow), hasMore: !!data.isMore };
      });
    },

    async suggest(q) {
      if (mock) {
        return filterByName(readFixture('searchSuggest').data.map(normalizeShow), q, 'name');
      }
      return call(async () => unwrap(await client.suggestSearch(q)).map(normalizeShow));
    },

    async chapters(bookId, { fresh = false } = {}) {
      const key = String(bookId);
      const cached = chapterCache.get(key);
      if (!fresh && cached && Date.now() - cached.at < CHAPTER_TTL_MS) return cached.value;

      let data;
      if (mock) {
        data = readFixture('getChapters').data;
        for (const ch of data.chapters) {
          const url = `${mockUrl}?n=${encodeURIComponent(String(ch.chapterId))}`;
          ch.videoPath = url;
          for (const cdn of ch.cdnList || []) {
            for (const v of cdn.videoPathList || []) v.videoPath = url;
          }
        }
      } else {
        data = await call(async () => unwrap(await client.getChapters(key)));
      }

      const value = {
        bookId: key,
        totalChapters: data.totalChapters ?? data.chapters.length,
        chapters: data.chapters.map((c) => ({
          index: Number(c.chapterIndex),
          chapterId: String(c.chapterId),
          name: String(c.chapterName || '').trim(),
          cdnList: c.cdnList || [],
        })),
      };
      chapterCache.set(key, { at: Date.now(), value });
      return value;
    },

    async streamUrl(bookId, index) {
      if (mock) return `${mockUrl}?n=${encodeURIComponent(`${bookId}-${index}`)}`;
      return call(async () => {
        const data = unwrap(await client.getStreamUrl(String(bookId), index));
        const url = data?.data?.chapter?.video?.mp4;
        if (!url) throw httpError(502, 'Dramabox API returned no stream URL for this episode');
        return url;
      });
    },
  };
}
