import { httpError } from '../errors.js';
import { normalizeShow } from '../normalize.js';

export const DEFAULT_LANG = 'en';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [750, 2000];

const showIdKeys = [
  'bookId',
  'shortPlayId',
  'shortPlayLibraryId',
  'playlet_id',
  'playletId',
  'cid',
  'book_id',
  'dramaId',
  'drama_id',
  'series_id',
  'seriesId',
  'contentId',
  'programId',
  'id',
];

const showNameKeys = [
  'bookName',
  'shortPlayName',
  'playlet_name',
  'playletName',
  'title',
  'name',
  'dramaName',
  'book_name',
  'seriesName',
  'contentName',
  'programName',
  'videoName',
];

const coverKeys = [
  'coverWap',
  'shortPlayCover',
  'cover_url',
  'coverUrl',
  'coverImage',
  'horizontalCoverUrl',
  'contentCoverUrl',
  'seriesCover',
  'coverImg',
  'coverPath',
  'cover',
  'image',
  'pic',
  'poster',
  'thumbnail',
];

const introKeys = [
  'shortPlayIntroduction',
  'introduction',
  'description',
  'synopsis',
  'summary',
  'intro',
  'remark',
  'bookDesc',
  'contentDesc',
  'programDesc',
  'desc',
];

const episodeCountKeys = [
  'chapterCount',
  'episodeCount',
  'totalEpisode',
  'total_episodes',
  'episode_count',
  'chapterNum',
  'totalEpisodes',
  'upload_num',
  'maxEpisodeNo',
  'episodeNum',
  'episodes',
];

const tagKeys = [
  'tagV3s',
  'labelArray',
  'label_list',
  'shortPlayLabels',
  'series_tag',
  'tagList',
  'tags',
  'labels',
  'types',
  'cat',
  'category',
  'genre',
];

const playCountKeys = ['heatScoreShow', 'playCount', 'viewCount', 'views', 'play_count', 'hot'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function baseOf(source) {
  const value = String(source?.config?.base || '').trim();
  if (!value) throw httpError(400, 'Source base URL is missing');
  return value.replace(/\/+$/, '');
}

export function hostOf(source) {
  try {
    return new URL(baseOf(source)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function firstValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTags(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return stripHtml(item);
        return stripHtml(item?.tagEnName || item?.tagName || item?.name || item?.title || '');
      })
      .filter(Boolean);
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parseTags(parsed);
  } catch {
    // Fall through to comma splitting.
  }
  return value
    .split(/[,|]/)
    .map(stripHtml)
    .filter(Boolean);
}

export function dedupeShows(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item?.bookId || seen.has(item.bookId)) continue;
    seen.add(item.bookId);
    out.push(item);
  }
  return out;
}

export function mapShow(raw = {}) {
  const item = raw?.Item?.VideoInfo || raw?.VideoInfo || raw?.item?.VideoInfo || raw;
  const tags = parseTags(firstValue(item, tagKeys));

  return normalizeShow({
    bookId: String(firstValue(item, showIdKeys) ?? '').trim(),
    bookName: stripHtml(firstValue(item, showNameKeys) || ''),
    coverWap: String(firstValue(item, coverKeys) || ''),
    introduction: stripHtml(firstValue(item, introKeys) || ''),
    chapterCount: toNumber(firstValue(item, episodeCountKeys), 0),
    playCount: String(firstValue(item, playCountKeys) ?? ''),
    tagV3s: tags,
    status: item?.status ? String(item.status) : item?.isFinished ? 'completed' : null,
  });
}

function isRichShow(item) {
  return !!(
    firstValue(item, coverKeys) ||
    firstValue(item, introKeys) ||
    firstValue(item, episodeCountKeys)
  );
}

// Walks arbitrary response shapes and returns every object that looks like a
// drama. GoodBos wraps the same fields differently on almost every platform,
// so this keeps the adapters small and resilient to wrapper changes.
export function collectShows(root, { requireRich = true, limit = 200 } = {}) {
  const items = [];
  const seen = new Set();

  function visit(value, depth = 0) {
    if (depth > 14 || items.length >= limit || value == null) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;

    const obj = value.Item?.VideoInfo || value.VideoInfo || value;
    const id = firstValue(obj, showIdKeys);
    const name = firstValue(obj, showNameKeys);
    if (
      id !== undefined &&
      typeof name === 'string' &&
      name.trim() &&
      (!requireRich || isRichShow(obj))
    ) {
      const mapped = mapShow(obj);
      if (mapped.bookId && mapped.name && !seen.has(mapped.bookId)) {
        seen.add(mapped.bookId);
        items.push(mapped);
      }
    }

    for (const entry of Object.values(value)) visit(entry, depth + 1);
  }

  visit(root);
  return items;
}

export function firstString(obj, keys) {
  const value = firstValue(obj, keys);
  return typeof value === 'string' ? value : '';
}

export function qualityNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').match(/(\d{3,4})/);
  return match ? Number(match[1]) : 0;
}

export function pickQuality(variants, maxQuality = 720) {
  const list = (variants || [])
    .map((variant) => {
      if (typeof variant === 'string') {
        return { url: variant, quality: qualityNumber(variant) };
      }
      if (!variant || typeof variant !== 'object') return null;
      const url =
        variant.url ||
        variant.videoUrl ||
        variant.filePath ||
        variant.hls_url ||
        variant.m3u8 ||
        variant.m3u8_path ||
        variant.mediaUrl ||
        variant.playUrl ||
        variant.mp4 ||
        variant.video_path ||
        variant.path;
      if (!url || typeof url !== 'string') return null;
      const quality = qualityNumber(
        variant.quality ??
          variant.type ??
          variant.definition ??
          variant.resolution ??
          variant.q ??
          variant.label ??
          variant.name ??
          url,
      );
      return { url, quality };
    })
    .filter(Boolean);

  if (!list.length) return null;
  const within = list.filter((v) => !maxQuality || !v.quality || v.quality <= maxQuality);
  const pool = within.length ? within : list;
  pool.sort((a, b) => b.quality - a.quality);
  return pool[0].url;
}

export function isVideoUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  if (/\.(jpg|jpeg|png|webp|gif|svg|avif)(\?|$)/i.test(value)) return false;
  return /(\.m3u8|\.mp4|\.webm|\.ts|\/hls\/|m3u8|videotv|video-cdn|playlet-hls|\/video\/)/i.test(
    value,
  );
}

export function collectVideoUrls(root, { maxQuality = 720, limit = 80 } = {}) {
  const found = [];
  const seen = new Set();

  function visit(value, depth = 0, qualityHint = 0) {
    if (depth > 14 || found.length >= limit || value == null) return;
    if (typeof value === 'string') {
      if (isVideoUrl(value) && !seen.has(value)) {
        seen.add(value);
        found.push({ url: value, quality: qualityHint || qualityNumber(value) });
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1, qualityHint);
      return;
    }
    if (typeof value !== 'object') return;

    for (const [key, entry] of Object.entries(value)) {
      const hint =
        qualityNumber(key) ||
        qualityNumber(value?.quality ?? value?.type ?? value?.definition ?? value?.label);
      visit(entry, depth + 1, hint || qualityHint);
    }
  }

  visit(root);
  return pickQuality(found, maxQuality);
}

export function firstVideoUrl(root, maxQuality = 720) {
  return collectVideoUrls(root, { maxQuality });
}

export function absoluteUrl(value, base) {
  if (!value || typeof value !== 'string') return '';
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function errorDetail(text) {
  if (!text) return '';
  try {
    const data = JSON.parse(text);
    const message = data?.error || data?.message || data?.msg || data?.data?.message;
    if (message) return String(message);
  } catch {
    // Not JSON.
  }
  return String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function requestJson(url, apiKey, { headers = {}, timeout = 20000, retries = true } = {}) {
  const requestHeaders = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 LocalDrama/0.1',
    ...headers,
  };
  if (apiKey && !requestHeaders['x-token']) requestHeaders['x-token'] = apiKey;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: requestHeaders,
        signal: AbortSignal.timeout(timeout),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        const detail = errorDetail(text);
        const message = `GoodBos HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`;
        if (RETRYABLE_STATUS.has(res.status) && retries && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw httpError(502, message);
      }
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        throw httpError(502, 'GoodBos returned invalid JSON');
      }
    } catch (err) {
      if (err.statusCode || !retries || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function platformContext(source, options = {}) {
  const base = baseOf(source);
  const apiKey = String(options.apiKey || '');
  const lang = String(options.lang || DEFAULT_LANG);
  const quality = Number(options.quality) || 720;

  return {
    source,
    base,
    apiKey,
    lang,
    quality,
    async request(path, params = {}, { auth = 'header', sendHeader = true, timeout, retries } = {}) {
      const url = new URL(path, base);
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
      if (apiKey && auth === 'code') url.searchParams.set('code', apiKey);
      return requestJson(url.toString(), sendHeader ? apiKey : '', { timeout, retries });
    },
    async requestUrl(url, params = {}, { auth = 'header', sendHeader = true, timeout, retries } = {}) {
      const target = new URL(url, base);
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          target.searchParams.set(key, String(value));
        }
      }
      if (apiKey && auth === 'code') target.searchParams.set('code', apiKey);
      return requestJson(target.toString(), sendHeader ? apiKey : '', { timeout, retries });
    },
  };
}

export function chaptersFrom(rawList, mapOne) {
  const chapters = (rawList || [])
    .map((raw, i) => mapOne(raw, i))
    .filter((chapter) => chapter && Number.isFinite(chapter.index))
    .sort((a, b) => a.index - b.index);
  return chapters;
}

export function totalFrom(data, chapters) {
  return (
    toNumber(
      firstValue(data, [
        'totalEpisode',
        'total_episodes',
        'episode_count',
        'episodeCount',
        'chapterCount',
        'total',
        'totalChapters',
      ]),
      0,
    ) || chapters.length
  );
}

export function isHlsUrl(url) {
  return /\.m3u8(\?|$)|[?&](format|type)=m3u8|\/hls\//i.test(String(url || ''));
}

// Some GoodBos platforms index Indonesian titles only. Keep a small alias
// table so an English search still finds the obvious matches.
const SEARCH_ALIASES = {
  love: ['cinta', 'kasih'],
  marriage: ['pernikahan', 'nikah'],
  married: ['menikah', 'nikah'],
  wedding: ['pernikahan'],
  wife: ['istri'],
  husband: ['suami'],
  divorce: ['perceraian', 'cerai'],
  revenge: ['balas dendam', 'dendam'],
  baby: ['bayi'],
  child: ['anak'],
  children: ['anak'],
  secret: ['rahasia'],
  billionaire: ['miliarder'],
  rich: ['kaya'],
  poor: ['miskin'],
  family: ['keluarga'],
  mother: ['ibu'],
  father: ['ayah'],
  sister: ['saudari', 'kakak'],
  brother: ['saudara', 'adik'],
  boss: ['atasan'],
  pregnant: ['hamil'],
  affair: ['selingkuh', 'perselingkuhan'],
  contract: ['kontrak'],
  heir: ['pewaris'],
  mafia: ['mafia'],
  queen: ['ratu'],
  king: ['raja'],
  doctor: ['dokter'],
  school: ['sekolah'],
};

export function searchAliases(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const aliases = [];
  for (const [word, values] of Object.entries(SEARCH_ALIASES)) {
    if (needle === word || needle.includes(word)) aliases.push(...values);
  }
  return [...new Set(aliases)].filter((value) => value !== needle);
}

