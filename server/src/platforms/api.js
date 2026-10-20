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

function authCode() {
  return { auth: 'code' };
}

function makeChapter(index, raw, videoUrl, name) {
  return {
    index,
    chapterId: String(raw?.chapterId ?? raw?.id ?? raw?.chapter_id ?? raw?.episode ?? index),
    name: stripHtml(name || raw?.name || raw?.title || `Episode ${index + 1}`),
    videoUrl: videoUrl || null,
  };
}

export const reelBuzz = {
  id: 'reelbuzz',
  host: 'reelbuzz.goodbos.online',
  label: 'ReelBuzz',

  async latest(ctx, { page = 1 } = {}) {
    const offset = (page - 1) * 10;
    const data = await ctx.request('/api/dramas', { offset, limit: 10, code: ctx.apiKey }, authCode());
    const items = dedupeShows((data?.dramas || []).map(mapShow));
    return { items, hasMore: !!data?.hasMore };
  },

  async search(ctx, { q } = {}) {
    let data = await ctx.request('/api/search', { q, code: ctx.apiKey }, authCode());
    let items = dedupeShows(collectShows(data?.results ?? data, { requireRich: false }));
    for (const alias of searchAliases(q)) {
      if (items.length) break;
      data = await ctx.request('/api/search', { q: alias, code: ctx.apiKey }, authCode());
      items = dedupeShows(collectShows(data?.results ?? data, { requireRich: false }));
    }
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      '/api/drama/detail',
      { id: bookId, code: ctx.apiKey },
      authCode(),
    );
    const rows = data?.rows || {};
    const raw = Array.isArray(rows.episodeList) ? rows.episodeList : [];
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.episodeNo);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return makeChapter(
        index,
        ep,
        ep.fileUrl || pickQuality(ep.qualityList, ctx.quality),
        ep.title,
      );
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(rows.episodes, chapters.length),
      chapters,
    };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (ep?.videoUrl) return ep.videoUrl;
    const play = await ctx.request(
      '/api/drama/play',
      { dramaId: bookId, ep: Number(index) + 1, code: ctx.apiKey },
      authCode(),
    );
    const url = play?.playURL || play?.proxyURL || firstVideoUrl(play, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const list = await ctx.request('/api/dramas', { offset: 0, limit: 1, code: ctx.apiKey }, authCode());
    const first = list?.dramas?.[0];
    if (!first?.drama_id) return { ok: false, error: 'No dramas returned by ReelBuzz' };
    const detail = await ctx.request(
      '/api/drama/detail',
      { id: first.drama_id, code: ctx.apiKey },
      authCode(),
    );
    if (!Array.isArray(detail?.rows?.episodeList) || !detail.rows.episodeList.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};

export const moboReels = {
  id: 'moboreels',
  host: 'moboreels.goodbos.online',
  label: 'MoboReels',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/v1/series', {
      lang: ctx.lang,
      page: Math.max(0, page - 1),
      limit: 30,
      code: ctx.apiKey,
    });
    const items = dedupeShows((data?.data?.seriesList || []).map(mapShow));
    return { items, hasMore: items.length >= 30 };
  },

  async search(ctx, { q } = {}) {
    let data = await ctx.request('/api/v1/search', {
      q,
      lang: ctx.lang,
      code: ctx.apiKey,
    });
    let items = dedupeShows(collectShows(data, { requireRich: false }));
    for (const alias of searchAliases(q)) {
      if (items.length) break;
      data = await ctx.request('/api/v1/search', {
        q: alias,
        lang: ctx.lang,
        code: ctx.apiKey,
      });
      items = dedupeShows(collectShows(data, { requireRich: false }));
    }
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/v1/series/${encodeURIComponent(bookId)}`,
      { code: ctx.apiKey },
      authCode(),
    );
    const detail = data?.data || {};
    const raw = Array.isArray(detail.episodes) ? detail.episodes : [];
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.episNum);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return makeChapter(index, ep, ep.mediaUrl, `Episode ${no || index + 1}`);
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(detail.totalEpisodes, chapters.length),
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
    const list = await ctx.request('/api/v1/series', {
      lang: ctx.lang,
      page: 0,
      limit: 1,
      code: ctx.apiKey,
    });
    const first = list?.data?.seriesList?.[0];
    if (!first?.seriesId) return { ok: false, error: 'No dramas returned by MoboReels' };
    const detail = await ctx.request(
      `/api/v1/series/${encodeURIComponent(first.seriesId)}`,
      { code: ctx.apiKey },
      authCode(),
    );
    if (!Array.isArray(detail?.data?.episodes) || !detail.data.episodes.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};

export const reelife = {
  id: 'reelife',
  host: 'reelife.goodbos.online',
  label: 'Reelife',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/v1/home', { page, lang: ctx.lang });
    const items = dedupeShows((data?.dramas || []).map(mapShow));
    return { items, hasMore: !!data?.hasMore };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/v1/search', { q, page, lang: ctx.lang });
    const items = dedupeShows(collectShows(data?.dramas ?? data, { requireRich: false }));
    return { items, hasMore: !!data?.hasMore };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/v1/book/${encodeURIComponent(bookId)}/chapters`,
      { lang: ctx.lang, page: 1, pageSize: 500 },
    );
    const detail = data?.data || {};
    const raw = Array.isArray(detail.chapterList) ? detail.chapterList : [];
    const chapters = chaptersFrom(raw, (ep, i) => {
      const index = Number.isFinite(Number(ep.index)) ? Number(ep.index) : i;
      return makeChapter(index, { ...ep, id: ep.chapterId }, null, ep.chapterName);
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(detail.bookVo?.chapterCount, chapters.length),
      chapters,
    };
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = data.chapters.find((c) => c.index === Number(index));
    if (!ep) throw httpError(502, 'Episode no longer exists upstream');
    const play = await ctx.request(
      `/api/v1/play/${encodeURIComponent(bookId)}/${encodeURIComponent(ep.chapterId)}`,
      { code: ctx.apiKey, lang: ctx.lang },
      { sendHeader: false },
    );
    const url = play?.videoUrl || firstVideoUrl(play, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    if (!ctx.apiKey) return { ok: false, error: 'API key required to play or download episodes' };
    const home = await ctx.request('/api/v1/home', { page: 1, lang: ctx.lang });
    const first = home?.dramas?.[0];
    if (!first?.bookId) return { ok: false, error: 'No dramas returned by Reelife' };
    const chapters = await ctx.request(
      `/api/v1/book/${encodeURIComponent(first.bookId)}/chapters`,
      { lang: ctx.lang, page: 1, pageSize: 500 },
    );
    if (!Array.isArray(chapters?.data?.chapterList) || !chapters.data.chapterList.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};

function storyEpisodes(data) {
  const detail = data?.data || {};
  return Array.isArray(detail.episodes) ? detail.episodes : [];
}

export const storyReel = {
  id: 'storyreel',
  host: 'storyreel.goodbos.online',
  label: 'Storyreel',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/v1/home', { lang: ctx.lang, tab: 1 });
    const items = dedupeShows((data?.data || []).map(mapShow)).slice(0, 30);
    return { items, hasMore: false };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/v1/search', { q, lang: ctx.lang });
    const items = dedupeShows(collectShows(data?.data ?? data, { requireRich: false }));
    return { items, hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(`/api/v1/alleps/${encodeURIComponent(bookId)}`, {
      lang: ctx.lang,
    });
    const raw = storyEpisodes(data);
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.episode);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      const video = ep.video || {};
      const variants = Object.entries(video).map(([quality, url]) => ({ quality, url }));
      const url =
        video.video_720 ||
        video.video_1080 ||
        video.video_480 ||
        pickQuality(variants, ctx.quality);
      return makeChapter(index, ep, url, `Episode ${no || index + 1}`);
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(data?.data?.episode_count ?? data?.data?.episodes?.length, chapters.length),
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
    const home = await ctx.request('/api/v1/home', { lang: ctx.lang, tab: 1 });
    const first = home?.data?.[0];
    if (!first?.id) return { ok: false, error: 'No dramas returned by Storyreel' };
    const eps = await ctx.request(`/api/v1/alleps/${encodeURIComponent(first.id)}`, {
      lang: ctx.lang,
    });
    if (!storyEpisodes(eps).length) return { ok: false, error: 'Episode list is empty' };
    return { ok: true };
  },
};

export const vibeshort = {
  ...storyReel,
  id: 'vibeshort',
  host: 'vibeshort.goodbos.online',
  label: 'Vibeshort',
};

export const serialPlus = {
  id: 'serialplus',
  host: 'serealplus.goodbos.online',
  label: 'Serial+',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/home', {
      lang: ctx.lang,
      page,
      code: ctx.apiKey,
    });
    const root = data?.data || {};
    const items = dedupeShows((root.list || []).map(mapShow));
    return { items, hasMore: !!root.hasMore };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/search', {
      q,
      lang: ctx.lang,
      page,
      code: ctx.apiKey,
    });
    const root = data?.data || {};
    const raw = Array.isArray(root) ? root : root.list || [];
    const items = dedupeShows(collectShows(raw, { requireRich: false }));
    return { items, hasMore: !!root.hasMore };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      '/api/episodes',
      { id: bookId, lang: ctx.lang, code: ctx.apiKey },
      authCode(),
    );
    const raw = Array.isArray(data?.episodes) ? data.episodes : [];
    const chapters = chaptersFrom(raw, (ep, i) => {
      const no = Number(ep.seqNo);
      const index = Number.isFinite(no) && no > 0 ? no - 1 : i;
      return makeChapter(index, ep, ep.videoUrl, `Episode ${no || index + 1}`);
    });
    return {
      bookId: String(bookId),
      totalChapters: toNumber(data?.total, chapters.length),
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
    const home = await ctx.request('/api/home', { lang: ctx.lang, page: 1, code: ctx.apiKey });
    const first = home?.data?.list?.[0];
    if (!first?.contentId) return { ok: false, error: 'No dramas returned by Serial+' };
    const eps = await ctx.request(
      '/api/episodes',
      { id: first.contentId, lang: ctx.lang, code: ctx.apiKey },
      authCode(),
    );
    if (!Array.isArray(eps?.episodes) || !eps.episodes.length) {
      return { ok: false, error: 'Episode list is empty' };
    }
    return { ok: true };
  },
};
