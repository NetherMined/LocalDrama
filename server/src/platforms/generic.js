import { httpError } from '../errors.js';
import {
  collectShows,
  dedupeShows,
  firstVideoUrl,
  firstValue,
  mapShow,
  pickQuality,
  stripHtml,
  toNumber,
} from './common.js';

function authCode() {
  return { auth: 'code' };
}

const EPISODE_NUMBER_KEYS = [
  'episode',
  'episodeNo',
  'episode_number',
  'episNum',
  'seqNo',
  'seq',
  'chapterIndex',
  'chapterNum',
  'index',
  'sort',
  'ep',
  'sectionId',
];

const EPISODE_NAME_KEYS = ['name', 'title', 'episodeName', 'chapterName', 'sectionName'];

function episodeNumber(obj, fallback) {
  for (const key of EPISODE_NUMBER_KEYS) {
    const n = Number(obj?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function collectEpisodes(root, maxQuality = 720) {
  const found = [];
  const seen = new Set();

  function visit(value, depth = 0) {
    if (depth > 14 || value == null) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const url = firstVideoUrl(value, maxQuality);
    if (url) {
      const no = episodeNumber(value, found.length + 1);
      const index = no > 0 ? no - 1 : found.length;
      if (!seen.has(index)) {
        seen.add(index);
        found.push({
          index,
          chapterId: String(value.id ?? value.chapterId ?? value.vid ?? no),
          name: stripHtml(firstValue(value, EPISODE_NAME_KEYS) || `Episode ${index + 1}`),
          videoUrl: url,
        });
      }
    }
    for (const entry of Object.values(value)) visit(entry, depth + 1);
  }

  visit(root);
  return found.sort((a, b) => a.index - b.index);
}

function smallNumber(root, { min = 1, max = 5000 } = {}) {
  let found = null;
  function visit(value, depth = 0) {
    if (depth > 12 || found !== null || value == null) return;
    if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) {
      found = value;
      return;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const n = Number(value);
      if (Number.isInteger(n) && n >= min && n <= max) {
        found = n;
        return;
      }
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      for (const entry of Object.values(value)) visit(entry, depth + 1);
    }
  }
  visit(root);
  return found;
}

const VARIANT_MARKERS = ['Crel', 'Dweath', 'Bbar', 'Mmast', 'Fdela'];
const CODEC_TITLE = /^(h264|h265|hevc|av1|vp9|mp4|m3u8|\d{3,4}p)$/i;

function obfuscatedShows(root, kind) {
  const shows = [];
  const seen = new Set();

  function visit(value, depth = 0) {
    if (depth > 14 || value == null) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;

    // RapidTV nests each episode's transcoded variants as objects with the
    // same URL fields. They are not dramas; skip them (and their children).
    if (VARIANT_MARKERS.some((key) => key in value)) return;

    const strings = Object.values(value).filter((v) => typeof v === 'string' && v.trim());
    const description = strings
      .filter((s) => !/^https?:\/\//i.test(s))
      .sort((a, b) => b.length - a.length)[0];
    const cover = strings.find(
      (s) => /^https?:\/\//i.test(s) && /(cover|tplv|image|\.jpg|\.jpeg|\.png|\.webp)/i.test(s),
    );
    const candidates = strings
      .filter((s) => s !== description && s !== cover && !/^https?:\/\//i.test(s))
      .filter((s) => s.length >= 2 && s.length <= 200)
      .filter((s) => !['NULL', 'en', 'id', 'PUB', 'SELF_OWNED', 'COMPLETED'].includes(s))
      .filter((s) => !CODEC_TITLE.test(s) && !/^[a-f0-9]{24,}$/i.test(s))
      .sort((a, b) => b.length - a.length);
    const title = candidates[0];

    let id = null;
    if (kind === 'dotdrama') {
      id = strings.find((s) => /^\d{15,20}$/.test(s)) || null;
    } else {
      const numbers = Object.values(value)
        .map((v) => {
          if (typeof v === 'number' && Number.isInteger(v)) return v;
          if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
          return null;
        })
        .filter((v) => v !== null && v >= 100 && v < 1e9);
      if (numbers.length) id = String(Math.max(...numbers));
    }

    if (id && title && (cover || (description && description.length >= 40))) {
      const episodeCount = smallNumber(value);
      const tags = Object.values(value).find(
        (v) => Array.isArray(v) && v.length && v.every((t) => typeof t === 'string' && !/^https?:/i.test(t)),
      ) || [];
      const mapped = mapShow({
        bookId: id,
        bookName: title,
        coverWap: cover || '',
        introduction: description || '',
        chapterCount: episodeCount || 0,
        tagV3s: tags,
      });
      if (mapped.bookId && !seen.has(mapped.bookId)) {
        seen.add(mapped.bookId);
        shows.push(mapped);
      }
    }

    for (const entry of Object.values(value)) visit(entry, depth + 1);
  }

  visit(root);
  return shows;
}

function makeObfuscatedAdapter({ id, host, label, kind }) {
  return {
    id,
    host,
    label,

    async latest(ctx, { page = 1 } = {}) {
      const data = await ctx.request('/api/drama/list', { lang: ctx.lang, page, limit: 18 });
      const items = dedupeShows(obfuscatedShows(data, kind));
      return { items, hasMore: items.length >= 18 };
    },

    async search(ctx, { q } = {}) {
      const data = await ctx.request('/api/search', { q, lang: ctx.lang });
      const items = dedupeShows(obfuscatedShows(data?.results ?? data, kind));
      return { items, hasMore: false };
    },

    async chapters(ctx, bookId) {
      let total = 0;
      if (kind === 'dotdrama') {
        const first = await ctx.request(
          `/api/drama/${encodeURIComponent(bookId)}/1`,
          { lang: ctx.lang, code: ctx.apiKey },
          authCode(),
        );
        total = toNumber(first?.total_episodes, 0);
      } else {
        const detail = await ctx.request(
          `/api/drama/${encodeURIComponent(bookId)}`,
          { lang: ctx.lang, code: ctx.apiKey },
          authCode(),
        );
        total = smallNumber(detail, { min: 1, max: 5000 }) || 0;
      }
      if (!total) throw httpError(502, 'No episodes returned for this drama');
      const chapters = Array.from({ length: total }, (_, i) => ({
        index: i,
        chapterId: String(i + 1),
        name: `Episode ${i + 1}`,
      }));
      return { bookId: String(bookId), totalChapters: total, chapters };
    },

    async streamUrl(ctx, bookId, index) {
      const ep = Number(index) + 1;
      const data = await ctx.request(
        `/api/drama/${encodeURIComponent(bookId)}/${ep}`,
        { lang: ctx.lang, code: ctx.apiKey },
        authCode(),
      );
      let url = null;
      if (kind === 'dotdrama') {
        url = data?.video_hd || data?.video_url || firstVideoUrl(data, ctx.quality);
      } else {
        const variants = Array.isArray(data?.data?.ptie)
          ? data.data.ptie.map((v) => ({ url: v.Mmast || v.Bbar, quality: v.Dweath }))
          : [];
        url = pickQuality(variants, ctx.quality) || firstVideoUrl(data, ctx.quality);
      }
      if (!url) throw httpError(502, 'No stream URL returned for this episode');
      return url;
    },

    async test(ctx) {
      if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
      const data = await ctx.request('/api/drama/list', { lang: ctx.lang, page: 1, limit: 18 });
      const first = obfuscatedShows(data, kind)[0];
      if (!first) return { ok: false, error: `No dramas returned by ${label}` };
      const url = await this.streamUrl(ctx, first.bookId, 0);
      if (!url) return { ok: false, error: 'No playable stream returned' };
      return { ok: true };
    },
  };
}

export const dotDrama = makeObfuscatedAdapter({
  id: 'dotdrama',
  host: 'dotdrama.goodbos.online',
  label: 'DotDrama',
  kind: 'dotdrama',
});

export const rapidTv = makeObfuscatedAdapter({
  id: 'rapidtv',
  host: 'rapidtv.goodbos.online',
  label: 'RapidTV',
  kind: 'rapidtv',
});

export const shortMax = {
  id: 'shortmax',
  host: 'shortmax.goodbos.online',
  label: 'ShortMax',

  async latest(ctx, { page = 1 } = {}) {
    try {
      const data = await ctx.request(
        '/api/v1/popular',
        { lang: ctx.lang, page, code: ctx.apiKey },
        { ...authCode(), timeout: 8000, retries: false },
      );
      const items = dedupeShows(collectShows(data));
      if (items.length) return { items, hasMore: items.length >= 20 };
    } catch {
      // /api/v1/popular is currently returning 500; the search feed still works.
    }
    const data = await ctx.request(
      '/api/v1/search',
      { lang: ctx.lang, q: 'love', page, code: ctx.apiKey },
      authCode(),
    );
    const items = dedupeShows(collectShows(data));
    return { items, hasMore: items.length >= 20 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request(
      '/api/v1/search',
      { lang: ctx.lang, q, page, code: ctx.apiKey },
      authCode(),
    );
    const items = dedupeShows(collectShows(data, { requireRich: false }));
    return { items, hasMore: items.length >= 20 };
  },

  async chapters(ctx, bookId) {
    let data = null;
    try {
      data = await ctx.request(
        `/api/v1/alleps/${encodeURIComponent(bookId)}`,
        { lang: ctx.lang, code: ctx.apiKey },
        authCode(),
      );
    } catch {
      data = await ctx.request(
        `/api/v1/detail/${encodeURIComponent(bookId)}`,
        { lang: ctx.lang, code: ctx.apiKey },
        authCode(),
      );
    }
    const chapters = collectEpisodes(data, ctx.quality);
    if (!chapters.length) throw httpError(502, 'No episodes returned for this drama');
    return { bookId: String(bookId), totalChapters: chapters.length, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (!ep?.videoUrl) throw httpError(502, 'No stream URL returned for this episode');
    return ep.videoUrl;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const latest = await this.latest(ctx, { page: 1 });
    const first = latest.items[0];
    if (!first) return { ok: false, error: 'No dramas returned by ShortMax' };
    const chapters = await this.chapters(ctx, first.bookId);
    if (!chapters.chapters.length) return { ok: false, error: 'Episode list is empty' };
    const url = await this.streamUrl(ctx, first.bookId, chapters.chapters[0].index);
    if (!url) return { ok: false, error: 'No playable stream returned' };
    return { ok: true };
  },
};

export const flareFlow = {
  id: 'flareflow',
  host: 'plerplow.goodbos.online',
  label: 'FlareFlow',

  async latest(ctx) {
    const data = await ctx.request(
      '/api/home',
      { code: ctx.apiKey, lang: ctx.lang },
      authCode(),
    );
    const items = dedupeShows(collectShows(data));
    return { items, hasMore: false };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request(
      '/api/search',
      { code: ctx.apiKey, lang: ctx.lang, q },
      authCode(),
    );
    const items = dedupeShows(collectShows(data, { requireRich: false }));
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      '/api/episodes',
      { code: ctx.apiKey, lang: ctx.lang, id: bookId },
      authCode(),
    );
    const chapters = collectEpisodes(data, ctx.quality);
    if (!chapters.length) throw httpError(502, 'No episodes returned for this drama');
    return { bookId: String(bookId), totalChapters: chapters.length, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (ep?.videoUrl) return ep.videoUrl;
    const single = await ctx.request(
      '/api/episode',
      { code: ctx.apiKey, lang: ctx.lang, id: bookId, ep: Number(index) + 1 },
      authCode(),
    );
    const url = firstVideoUrl(single, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required' };
    const data = await ctx.request(
      '/api/home',
      { code: ctx.apiKey, lang: ctx.lang },
      authCode(),
    );
    const first = collectShows(data)[0];
    if (!first) return { ok: false, error: 'No dramas returned by FlareFlow' };
    return { ok: true };
  },
};

async function firstTabId(ctx) {
  const tabs = await ctx.request('/api/v1/tabs', {
    lang: ctx.lang,
    code: ctx.apiKey,
  });
  const list = Array.isArray(tabs)
    ? tabs
    : tabs?.data || tabs?.list || tabs?.tabs || [];
  return list?.[0]?.id ?? list?.[0]?.tabId ?? null;
}

export const flexTv = {
  id: 'flextv',
  host: 'flextv.goodbos.online',
  label: 'FlexTV',

  async latest(ctx, { page = 1 } = {}) {
    const tabId = await firstTabId(ctx).catch(() => null);
    const paths = tabId
      ? [`/api/v1/tabs/${tabId}`, '/api/v1/home', '/api/v1/popular']
      : ['/api/v1/home', '/api/v1/popular'];
    let lastError = null;
    for (const path of paths) {
      try {
        const data = await ctx.request(path, {
          lang: ctx.lang,
          page,
          code: ctx.apiKey,
        });
        const items = dedupeShows(collectShows(data));
        if (items.length) return { items, hasMore: items.length >= 20 };
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return { items: [], hasMore: false };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/v1/search', {
      q,
      lang: ctx.lang,
      page,
      code: ctx.apiKey,
    });
    const items = dedupeShows(collectShows(data, { requireRich: false }));
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    let data = null;
    try {
      data = await ctx.request(
        `/api/v1/series/${encodeURIComponent(bookId)}/episodes`,
        { lang: ctx.lang, code: ctx.apiKey },
        authCode(),
      );
    } catch {
      data = await ctx.request(
        `/api/v1/series/${encodeURIComponent(bookId)}`,
        { lang: ctx.lang, code: ctx.apiKey },
        authCode(),
      );
    }
    const chapters = collectEpisodes(data, ctx.quality);
    if (!chapters.length) throw httpError(502, 'No episodes returned for this drama');
    return { bookId: String(bookId), totalChapters: chapters.length, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (ep?.videoUrl) return ep.videoUrl;
    const play = await ctx.request(
      `/api/v1/play/${encodeURIComponent(bookId)}/${Number(index) + 1}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(),
    );
    const url = firstVideoUrl(play, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required' };
    const data = await this.latest(ctx, { page: 1 });
    if (!data.items.length) return { ok: false, error: 'No dramas returned by FlexTV' };
    return { ok: true };
  },
};

export const vigloo = {
  id: 'vigloo',
  host: 'vigloo.goodbos.online',
  label: 'Vigloo',

  async latest(ctx, { page = 1 } = {}) {
    const paths = [
      `/api/v1/browse?sort=POPULAR&limit=30&offset=${(page - 1) * 30}`,
      `/api/v1/home`,
      `/api/v1/tabs/1`,
    ];
    let lastError = null;
    for (const path of paths) {
      try {
        const data = await ctx.request(path, {
          lang: ctx.lang,
          page,
          code: ctx.apiKey,
        });
        const items = dedupeShows(collectShows(data));
        if (items.length) return { items, hasMore: items.length >= 30 };
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return { items: [], hasMore: false };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/v1/search', {
      q,
      lang: ctx.lang,
      limit: 20,
      code: ctx.apiKey,
    });
    const items = dedupeShows(collectShows(data, { requireRich: false }));
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    const detail = await ctx.request(
      `/api/v1/drama/${encodeURIComponent(bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(),
    );
    let chapters = collectEpisodes(detail, ctx.quality);
    if (!chapters.length) {
      const seasonId = firstValue(detail, ['seasonId', 'currentSeasonId']);
      const programId = firstValue(detail, ['programId', 'dramaId', 'id']) || bookId;
      if (seasonId) {
        const episodes = await ctx.request(
          `/api/v1/drama/${encodeURIComponent(programId)}/season/${encodeURIComponent(seasonId)}/episodes`,
          { lang: ctx.lang, code: ctx.apiKey },
          authCode(),
        );
        chapters = collectEpisodes(episodes, ctx.quality);
      }
    }
    if (!chapters.length) throw httpError(502, 'No episodes returned for this drama');
    return { bookId: String(bookId), totalChapters: chapters.length, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (ep?.videoUrl) return ep.videoUrl;
    const play = await ctx.request(
      '/api/v1/play',
      { dramaId: bookId, ep: Number(index) + 1, lang: ctx.lang, code: ctx.apiKey },
      authCode(),
    );
    const url = firstVideoUrl(play, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required' };
    const data = await this.latest(ctx, { page: 1 });
    if (!data.items.length) return { ok: false, error: 'No dramas returned by Vigloo' };
    return { ok: true };
  },
};

export const velolo = {
  id: 'velolo',
  host: 'velolo.goodbos.online',
  label: 'Velolo',

  async latest(ctx, { page = 1 } = {}) {
    for (const path of ['/home', '/hot', '/new']) {
      try {
        const data = await ctx.request(path, { lang: ctx.lang, page, page_size: 20 });
        const items = dedupeShows(collectShows(data));
        if (items.length) return { items, hasMore: items.length >= 20 };
      } catch {
        // Try the next feed.
      }
    }
    return { items: [], hasMore: false };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/search', { q, lang: ctx.lang });
    const items = dedupeShows(collectShows(data, { requireRich: false }));
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(`/drama/${encodeURIComponent(bookId)}`, {
      lang: ctx.lang,
      code: ctx.apiKey,
    });
    const chapters = collectEpisodes(data, ctx.quality);
    if (!chapters.length) throw httpError(502, 'No episodes returned for this drama');
    return { bookId: String(bookId), totalChapters: chapters.length, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (ep?.videoUrl) return ep.videoUrl;
    const play = await ctx.request(
      `/play/${encodeURIComponent(bookId)}/${Number(index) + 1}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(),
    );
    const url = firstVideoUrl(play, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    const data = await this.latest(ctx, { page: 1 });
    if (!data.items.length) {
      return { ok: false, error: 'Velolo is returning no data upstream right now.' };
    }
    return { ok: true };
  },
};
