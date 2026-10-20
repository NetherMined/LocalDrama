import { httpError } from './errors.js';
import { normalizeShow } from './normalize.js';

const DEFAULT_LANG = 'en';

function baseOf(source) {
  const value = String(source?.config?.base || '').trim();
  if (!value) throw httpError(400, 'Source base URL is missing');
  return value.replace(/\/+$/, '');
}

function hostOf(source) {
  try {
    return new URL(baseOf(source)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// The per-platform GoodBos hosts do not share one API shape. Only the
// platforms implemented here are exposed as usable sources for now.
export function platformKind(source) {
  const host = hostOf(source);
  if (host === 'netshort.goodbos.online') return 'netshort';
  if (host === 'dramabox.goodbos.online') return 'dramabox';
  return 'unsupported';
}

function unsupported(source) {
  const name = source?.name || source?.config?.platform || 'This source';
  return httpError(
    501,
    `${name} is not supported yet. Supported GoodBos platforms: DramaBox and NetShort.`,
  );
}

async function requestJson(url, apiKey) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 LocalDrama/0.1',
  };
  if (apiKey) headers['x-token'] = apiKey;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error || parsed?.message || text;
    } catch {
      // Keep the raw response text.
    }
    throw httpError(502, `GoodBos HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 140)}` : ''}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(502, 'GoodBos returned invalid JSON');
  }
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(stripHtml).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(stripHtml).filter(Boolean);
  } catch {
    // Fall through to comma splitting.
  }
  return value.split(',').map(stripHtml).filter(Boolean);
}

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

function chapterNumber(item, fallback) {
  return Number(item.chapterIndex ?? item.index ?? fallback);
}

function firstCdnUrl(cdnList) {
  for (const cdn of cdnList || []) {
    const url = cdn.url || cdn.videoUrl || cdn.mp4 || cdn.playUrl;
    if (url) return url;
  }
  return null;
}

async function netShortLatest(source, { page, lang, apiKey }) {
  const data = await requestJson(`${baseOf(source)}/api/home/${page}?lang=${encodeURIComponent(lang)}`, apiKey);
  const raw = data?.data?.contentInfos;
  const items = dedupe((Array.isArray(raw) ? raw : []).map(mapNetShort));
  return { items, hasMore: items.length >= 20 };
}

async function netShortSearch(source, { q, page, lang, apiKey }) {
  const data = await requestJson(
    `${baseOf(source)}/api/search?q=${encodeURIComponent(q)}&page=${page}&lang=${encodeURIComponent(lang)}`,
    apiKey,
  );
  const raw = data?.data?.searchCodeSearchResult;
  const items = dedupe((Array.isArray(raw) ? raw : []).map(mapNetShort));
  const total = Number(data?.data?.total);
  return { items, hasMore: Number.isFinite(total) ? page * 20 < total : items.length >= 20 };
}

async function netShortChapters(source, bookId, { lang, apiKey }) {
  const data = await requestJson(
    `${baseOf(source)}/api/drama/${encodeURIComponent(bookId)}?lang=${encodeURIComponent(lang)}`,
    apiKey,
  );
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
}

async function netShortStreamUrl(source, bookId, index, { lang, apiKey }) {
  if (!apiKey) throw httpError(400, 'API key / token is required to play episodes');
  const ep = Number(index) + 1;
  const data = await requestJson(
    `${baseOf(source)}/api/watch/${encodeURIComponent(bookId)}/${ep}?lang=${encodeURIComponent(lang)}&code=${encodeURIComponent(apiKey)}`,
    apiKey,
  );
  const url = data?.data?.videoUrl || data?.data?.playUrl || data?.data?.url;
  if (!url) throw httpError(502, 'No stream URL returned for this episode');
  return url;
}

async function dramaBoxLatest(source, { page, lang, apiKey }) {
  const data = await requestJson(
    `${baseOf(source)}/api/dramabox/trending?lang=${encodeURIComponent(lang)}&page=${page}`,
    apiKey,
  );
  const raw = Array.isArray(data) ? data : (data.data || data.results || data.items || []);
  const items = dedupe((Array.isArray(raw) ? raw : []).map(mapDramaBox));
  return { items, hasMore: items.length >= 10 };
}

async function dramaBoxSearch(source, { q, page, lang, apiKey }) {
  const data = await requestJson(
    `${baseOf(source)}/api/dramabox/search?query=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}&page=${page}`,
    apiKey,
  );
  const raw = Array.isArray(data) ? data : (data.data || data.results || data.items || []);
  const items = dedupe((Array.isArray(raw) ? raw : []).map(mapDramaBox));
  return { items, hasMore: items.length >= 10 };
}

async function dramaBoxChapters(source, bookId, { apiKey }) {
  const data = await requestJson(
    `${baseOf(source)}/api/dramabox/allepisode?bookId=${encodeURIComponent(bookId)}`,
    apiKey,
  );
  const raw = Array.isArray(data) ? data : (data.data || []);
  const chapters = raw.map((c, i) => ({
    index: chapterNumber(c, i),
    chapterId: String(c.chapterId || c.id || i),
    name: String(c.chapterName || c.name || `Episode ${i + 1}`).trim(),
    cdnList: Array.isArray(c.cdnList) ? c.cdnList : [],
    videoUrl: c.videoUrl || c.mp4 || c.video?.mp4 || null,
  }));
  chapters.sort((a, b) => a.index - b.index);
  return { bookId: String(bookId), totalChapters: chapters.length, chapters };
}

async function dramaBoxStreamUrl(source, bookId, index, opts) {
  const data = await dramaBoxChapters(source, bookId, opts);
  const ep = data.chapters.find((c) => c.index === Number(index));
  const url = ep?.videoUrl || firstCdnUrl(ep?.cdnList);
  if (!url) throw httpError(502, 'No stream URL returned for this episode');
  return url;
}

export async function platformLatest(source, { page = 1, lang = DEFAULT_LANG, apiKey = '' } = {}) {
  switch (platformKind(source)) {
    case 'netshort':
      return netShortLatest(source, { page, lang, apiKey });
    case 'dramabox':
      return dramaBoxLatest(source, { page, lang, apiKey });
    default:
      throw unsupported(source);
  }
}

export async function platformSearch(source, { q, page = 1, lang = DEFAULT_LANG, apiKey = '' } = {}) {
  switch (platformKind(source)) {
    case 'netshort':
      return netShortSearch(source, { q, page, lang, apiKey });
    case 'dramabox':
      return dramaBoxSearch(source, { q, page, lang, apiKey });
    default:
      throw unsupported(source);
  }
}

export async function platformChapters(source, bookId, { lang = DEFAULT_LANG, apiKey = '' } = {}) {
  switch (platformKind(source)) {
    case 'netshort':
      return netShortChapters(source, bookId, { lang, apiKey });
    case 'dramabox':
      return dramaBoxChapters(source, bookId, { apiKey });
    default:
      throw unsupported(source);
  }
}

export async function platformStreamUrl(source, bookId, index, { lang = DEFAULT_LANG, apiKey = '' } = {}) {
  switch (platformKind(source)) {
    case 'netshort':
      return netShortStreamUrl(source, bookId, index, { lang, apiKey });
    case 'dramabox':
      return dramaBoxStreamUrl(source, bookId, index, { lang, apiKey });
    default:
      throw unsupported(source);
  }
}

export async function testPlatform(config = {}) {
  const source = { config };
  try {
    switch (platformKind(source)) {
      case 'netshort': {
        const data = await requestJson(`${baseOf(source)}/api/home/1?lang=${DEFAULT_LANG}`, config.apiKey || '');
        if (!config.apiKey) {
          return { ok: false, error: 'API key required to play or download episodes' };
        }
        const first = data?.data?.contentInfos?.[0];
        if (first?.shortPlayId) {
          await requestJson(
            `${baseOf(source)}/api/watch/${encodeURIComponent(first.shortPlayId)}/1?lang=${DEFAULT_LANG}&code=${encodeURIComponent(config.apiKey)}`,
            config.apiKey,
          );
        }
        return { ok: true };
      }
      case 'dramabox': {
        if (!config.apiKey) return { ok: false, error: 'API key required' };
        await requestJson(`${baseOf(source)}/api/dramabox/trending?lang=${DEFAULT_LANG}&page=1`, config.apiKey);
        return { ok: true };
      }
      default:
        return {
          ok: false,
          error: 'This platform is not supported yet. Supported GoodBos platforms: DramaBox and NetShort.',
        };
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
