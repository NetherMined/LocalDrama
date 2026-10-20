import { httpError } from '../errors.js';
import {
  chaptersFrom,
  collectShows,
  dedupeShows,
  firstVideoUrl,
  mapShow,
  pickQuality,
  searchAliases,
  stripHtml,
  toNumber,
} from './common.js';

function authCode(ctx) {
  return { auth: 'code' };
}

function chapterId(raw, fallback) {
  return String(raw?.chapterId ?? raw?.id ?? raw?.vid ?? raw?.episode ?? fallback);
}

function makeChapter(index, raw, videoUrl, name) {
  return {
    index,
    chapterId: chapterId(raw, index),
    name: stripHtml(name || raw?.name || raw?.title || `Episode ${index + 1}`),
    videoUrl: videoUrl || null,
  };
}

export const reelShort = {
  id: 'reelshort',
  host: 'reelshort.goodbos.online',
  label: 'ReelShort',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/trending', { lang: ctx.lang });
    const items = collectShows(data?.popular || data, { requireRich: false });
    return { items: dedupeShows(items), hasMore: items.length >= 10 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/search', { q, lang: ctx.lang, page });
    const items = collectShows(data?.results || data, { requireRich: false });
    return { items: dedupeShows(items), hasMore: items.length >= 20 };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/allepisodes/${encodeURIComponent(bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const raw = Array.isArray(data?.episodes) ? data.episodes : [];
    const chapters = raw.map((ep, i) => {
      const no = Number(ep.episode);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return makeChapter(
        index,
        ep,
        pickQuality(ep.streams, ctx.quality),
        ep.name,
      );
    });
    chapters.sort((a, b) => a.index - b.index);
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
    const data = await ctx.request('/trending', { lang: ctx.lang });
    const first = collectShows(data?.popular || data, { requireRich: false })[0];
    if (!first) return { ok: false, error: 'No dramas returned by ReelShort' };
    const eps = await ctx.request(
      `/allepisodes/${encodeURIComponent(first.bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    if (!Array.isArray(eps?.episodes) || !eps.episodes.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};

export const goodShort = {
  id: 'goodshort',
  host: 'goodshort.goodbos.online',
  label: 'GoodShort',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/home', { lang: ctx.lang, channel: -1, page, size: 20 });
    const items = collectShows(data);
    return { items: dedupeShows(items), hasMore: items.length >= 20 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request(
      '/search',
      { lang: ctx.lang, q, page, size: 15, code: ctx.apiKey },
      authCode(ctx),
    );
    const result = data?.data?.searchResult;
    const raw = Array.isArray(result)
      ? result
      : Array.isArray(result?.records)
        ? result.records
        : [];
    const items = dedupeShows((raw || []).map(mapShow));
    const pages = Number(result?.pages) || 0;
    const current = Number(result?.current) || page;
    return { items, hasMore: pages ? current < pages : items.length >= 15 };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/batchload/${encodeURIComponent(bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const root = data?.data || {};
    const raw = Array.isArray(root.episodes) ? root.episodes : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(
        Number.isFinite(Number(ep.index)) ? Number(ep.index) : i,
        ep,
        pickQuality(ep.videos, ctx.quality),
        ep.chapterName,
      ),
    );
    return {
      bookId: String(bookId),
      totalChapters: toNumber(root.chapterCount ?? root.episodeCount, chapters.length),
      chapters,
    };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (!ep?.videoUrl) throw httpError(502, 'No stream URL returned for this episode');
    return ep.videoUrl;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const data = await ctx.request('/home', { lang: ctx.lang, channel: -1, page: 1, size: 20 });
    const first = collectShows(data)[0];
    if (!first) return { ok: false, error: 'No dramas returned by GoodShort' };
    const batch = await ctx.request(
      `/batchload/${encodeURIComponent(first.bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    if (!Array.isArray(batch?.data?.episodes) || !batch.data.episodes.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};

function flickSearchFallback(shows, q) {
  const needle = q.toLowerCase();
  return shows.filter((show) => show.name.toLowerCase().includes(needle)).slice(0, 24);
}

export const flickReels = {
  id: 'flickreels',
  host: 'flickreels.goodbos.online',
  label: 'FlickReels',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/home', { lang: ctx.lang, page });
    const items = collectShows(data);
    return { items: dedupeShows(items), hasMore: items.length >= 12 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request(
      '/search',
      { q, lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const direct = collectShows(data?.data ?? data, { requireRich: false });
    if (direct.length) return { items: dedupeShows(direct), hasMore: direct.length >= 20 };

    // The upstream search endpoint returns data:null for every query right
    // now. Fall back to filtering the browse catalog so search still works.
    const [home, list] = await Promise.all([
      ctx.request('/api/home', { lang: ctx.lang, page: 1 }).catch(() => null),
      ctx.request('/api/list', {
        lang: ctx.lang,
        page: 1,
        page_size: 100,
        category_id: 0,
      }).catch(() => null),
    ]);
    const catalog = dedupeShows([
      ...collectShows(home),
      ...collectShows(list),
    ]);
    const items = flickSearchFallback(catalog, q);
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/batchload/${encodeURIComponent(bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const root = data?.data || {};
    const raw = Array.isArray(root.list) ? root.list : [];
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.chapter_num);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return makeChapter(
        index,
        ep,
        ep.hls_url || ep.hlsUrl || null,
        ep.chapter_title || ep.chapterTitle,
      );
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(root.episodeCount ?? root.total, chapters.length),
      chapters,
    };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (!ep?.videoUrl) throw httpError(502, 'No stream URL returned for this episode');
    return ep.videoUrl;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const home = await ctx.request('/api/home', { lang: ctx.lang, page: 1 });
    const first = collectShows(home)[0];
    if (!first) return { ok: false, error: 'No dramas returned by FlickReels' };
    const batch = await ctx.request(
      `/batchload/${encodeURIComponent(first.bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    if (!Array.isArray(batch?.data?.list) || !batch.data.list.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};

export const dramaBite = {
  id: 'dramabite',
  host: 'dramabite.goodbos.online',
  label: 'DramaBite',

  async latest(ctx) {
    const data = await ctx.request('/home', { lang: ctx.lang });
    const items = collectShows(data);
    return { items: dedupeShows(items), hasMore: false };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/search', { q, lang: ctx.lang });
    const items = collectShows(data?.results ?? data, { requireRich: false });
    return { items: dedupeShows(items), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/episodes/${encodeURIComponent(bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const raw = Array.isArray(data) ? data : data?.episodes || [];
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.vid);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return makeChapter(index, ep, ep.url || ep.m3u8, ep.title);
    });
    return { bookId: String(bookId), totalChapters: chapters.length, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (ep?.videoUrl) return ep.videoUrl;
    const play = await ctx.request(
      `/play/${encodeURIComponent(bookId)}/${Number(index) + 1}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const url = play?.url || play?.video_url || firstVideoUrl(play, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const home = await ctx.request('/home', { lang: ctx.lang });
    const first = collectShows(home)[0];
    if (!first) return { ok: false, error: 'No dramas returned by DramaBite' };
    const eps = await ctx.request(
      `/episodes/${encodeURIComponent(first.bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    if (!Array.isArray(eps) || !eps.length) return { ok: false, error: 'Episode list is empty' };
    return { ok: true };
  },
};

export const dramaWave = {
  id: 'dramawave',
  host: 'dramawave.goodbos.online',
  label: 'DramaWave',

  async latest(ctx) {
    const data = await ctx.request('/api/home', { lang: ctx.lang });
    const items = collectShows(data);
    return { items: dedupeShows(items), hasMore: false };
  },

  async search(ctx, { q, page = 1 } = {}) {
    let data = await ctx.request(
      '/api/search',
      { q, lang: ctx.lang, next: page, code: ctx.apiKey },
      authCode(ctx),
    );
    let root = data?.data || data || {};
    let raw = Array.isArray(root.list) ? root.list : [];
    for (const alias of searchAliases(q)) {
      if (raw.length) break;
      data = await ctx.request(
        '/api/search',
        { q: alias, lang: ctx.lang, next: page, code: ctx.apiKey },
        authCode(ctx),
      );
      root = data?.data || data || {};
      raw = Array.isArray(root.list) ? root.list : [];
    }
    const items = dedupeShows(raw.map(mapShow));
    const pageInfo = root.page_info || root.pageInfo || {};
    return {
      items,
      hasMore: pageInfo.has_more ?? pageInfo.hasMore ?? items.length >= 20,
    };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/drama/${encodeURIComponent(bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const detail = data?.data || {};
    const raw = (Array.isArray(detail.items) ? detail.items : []).filter((ep) => !ep.is_blooper);
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.serial_number);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      const url =
        ep.m3u8_path ||
        ep['720p_mp4'] ||
        ep['1080p_mp4'] ||
        ep['540p_mp4'] ||
        firstVideoUrl(ep, ctx.quality);
      return makeChapter(index, ep, url, ep.name);
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(detail.episode_count, chapters.length),
      chapters,
    };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (!ep?.videoUrl) throw httpError(502, 'No stream URL returned for this episode');
    return ep.videoUrl;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const home = await ctx.request('/api/home', { lang: ctx.lang });
    const first = collectShows(home)[0];
    if (!first) return { ok: false, error: 'No dramas returned by DramaWave' };
    const detail = await ctx.request(
      `/api/drama/${encodeURIComponent(first.bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    if (!Array.isArray(detail?.data?.items) || !detail.data.items.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};

export const starShort = {
  id: 'starshort',
  host: 'drakula.goodbos.online',
  label: 'StarShort',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/starshort/content/latest', {
      locale: ctx.lang,
      p: page,
      code: ctx.apiKey,
    });
    const items = dedupeShows((data?.data || []).map(mapShow));
    return { items, hasMore: items.length >= 12 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/starshort/search', {
      keyword: q,
      locale: ctx.lang,
      p: page,
      code: ctx.apiKey,
    });
    const items = dedupeShows((data?.data || []).map(mapShow));
    return { items, hasMore: items.length >= 10 };
  },

  async chapters(ctx, bookId) {
    const [detail, episodes] = await Promise.all([
      ctx.request(`/api/starshort/show/${encodeURIComponent(bookId)}`, {
        locale: ctx.lang,
        code: ctx.apiKey,
      }),
      ctx
        .request(`/api/starshort/show/${encodeURIComponent(bookId)}/episodes`, {
          locale: ctx.lang,
          code: ctx.apiKey,
        })
        .catch(() => null),
    ]);
    const info = detail?.data || {};
    const raw = Array.isArray(episodes?.data?.episodes) ? episodes.data.episodes : [];
    const byNumber = new Map(raw.map((ep) => [Number(ep.episode), ep]));
    const total = toNumber(info.total_episodes, raw.length);
    if (!total) throw httpError(502, 'No episodes returned for this drama');
    const chapters = Array.from({ length: total }, (_, i) => {
      const ep = byNumber.get(i + 1);
      return {
        index: i,
        chapterId: String(i + 1),
        name: `Episode ${i + 1}`,
        locked: ep ? ep.free === false : false,
      };
    });
    return { bookId: String(bookId), totalChapters: total, chapters };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await ctx.request(
      `/api/starshort/watch/${encodeURIComponent(bookId)}/${Number(index) + 1}`,
      { locale: ctx.lang, code: ctx.apiKey },
    );
    const url = data?.data?.video_url || firstVideoUrl(data?.data, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const data = await ctx.request('/api/starshort/content/latest', {
      locale: ctx.lang,
      p: 1,
      code: ctx.apiKey,
    });
    const first = (data?.data || [])[0];
    if (!first?.id) return { ok: false, error: 'No dramas returned by StarShort' };
    const watch = await ctx.request(
      `/api/starshort/watch/${encodeURIComponent(first.id)}/1`,
      { locale: ctx.lang, code: ctx.apiKey },
    );
    if (!watch?.data?.video_url) return { ok: false, error: 'No playable stream returned' };
    return { ok: true };
  },
};

export const melolo = {
  id: 'melolo',
  host: 'melolo.goodbos.online',
  label: 'Melolo',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/home', {
      lang: ctx.lang,
      offset: (page - 1) * 20,
      code: ctx.apiKey,
    });
    const items = dedupeShows((data?.data || []).map(mapShow));
    return { items, hasMore: items.length >= 20 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/search', {
      lang: ctx.lang,
      q,
      code: ctx.apiKey,
    });
    const items = dedupeShows((data?.data || []).map(mapShow));
    return { items, hasMore: !!data?.has_more };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/detail/${encodeURIComponent(bookId)}`,
      { lang: ctx.lang, code: ctx.apiKey },
      authCode(ctx),
    );
    const raw = Array.isArray(data?.videos) ? data.videos : [];
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.episode);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return makeChapter(index, ep, null, `Episode ${no || index + 1}`);
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(data?.episodes, chapters.length),
      chapters,
    };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await ctx.request(
      '/api/video',
      { id: bookId, ep: Number(index) + 1, code: ctx.apiKey },
      authCode(ctx),
    );
    const url =
      data?.videoUrl ||
      data?.url ||
      pickQuality(data?.qualityList, ctx.quality) ||
      firstVideoUrl(data, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const home = await ctx.request('/api/home', { lang: ctx.lang, offset: 0, code: ctx.apiKey });
    const first = (home?.data || [])[0];
    if (!first?.id) return { ok: false, error: 'No dramas returned by Melolo' };
    const video = await ctx.request(
      '/api/video',
      { id: first.id, ep: 1, code: ctx.apiKey },
      authCode(ctx),
    );
    if (!video?.videoUrl && !video?.qualityList?.length) {
      return { ok: false, error: 'No playable stream returned' };
    }
    return { ok: true };
  },
};
