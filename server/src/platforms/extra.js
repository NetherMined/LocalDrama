import { httpError } from '../errors.js';
import {
  chaptersFrom,
  collectShows,
  dedupeShows,
  firstVideoUrl,
  firstValue,
  mapShow,
  pickQuality,
  stripHtml,
  toNumber,
} from './common.js';
import { collectEpisodes } from './generic.js';

const codeAuth = { auth: 'code' };
const enc = encodeURIComponent;

function show({ id, title, cover, intro, episodes, plays, tags }) {
  return mapShow({
    bookId: String(id ?? ''),
    bookName: stripHtml(title || ''),
    coverWap: cover || '',
    introduction: intro || '',
    chapterCount: toNumber(episodes, 0),
    playCount: plays ?? '',
    tagV3s: tags || [],
  });
}

function makeChapter(index, chapterId, name, videoUrl) {
  return {
    index,
    chapterId: String(chapterId ?? index + 1),
    name: stripHtml(name) || `Episode ${index + 1}`,
    videoUrl: videoUrl || null,
  };
}

function indexFrom(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n - 1 : fallback;
}

function finish(bookId, chapters, total) {
  if (!chapters.length) throw httpError(502, 'No episodes returned for this drama');
  return { bookId: String(bookId), totalChapters: total || chapters.length, chapters };
}

function pickChapter(data, index) {
  return data.chapters.find((c) => c.index === Number(index));
}

async function firstStream(adapter, ctx, bookId, index) {
  const data = await adapter.chapters(ctx, bookId);
  const ep = pickChapter(data, index);
  if (!ep?.videoUrl) throw httpError(502, 'No stream URL returned for this episode');
  return ep.videoUrl;
}

// Shared test: browse must return dramas. testPlatform then checks episodes and the stream.
async function browseTest(adapter, ctx, label) {
  if (!ctx.apiKey) return { ok: false, error: 'API key required' };
  const data = await adapter.latest(ctx, { page: 1 });
  if (!data.items.length) return { ok: false, error: `No dramas returned by ${label}` };
  return { ok: true };
}

export const freeReels = {
  id: 'freereels',
  hosts: [],
  label: 'FreeReels',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request(
      '/api/freereels/popular',
      { page, lang: ctx.lang },
      codeAuth,
    );
    const items = dedupeShows(this.toShows(data));
    return { items, hasMore: items.length >= 10 };
  },

  toShows(data) {
    return (data?.data?.data?.items || [])
      .map((entry) => entry?.series || entry)
      .filter(Boolean)
      .map((s) =>
        show({
          id: s.key,
          title: s.title,
          cover: s.cover,
          intro: s.desc,
          episodes: s.episode_count,
          plays: s.follow_count,
          tags: s.content_tags || s.tag,
        }),
      );
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/freereels/search', { q, lang: ctx.lang }, codeAuth);
    return { items: dedupeShows(this.toShows(data)), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/freereels/drama/${enc(bookId)}`,
      { lang: ctx.lang },
      codeAuth,
    );
    const info = data?.data?.data?.info || {};
    const raw = Array.isArray(info.episode_list) ? info.episode_list : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(indexFrom(ep.index, i), ep.id, ep.name, null),
    );
    return finish(bookId, chapters, toNumber(info.episode_count, chapters.length));
  },

  async streamUrl(ctx, bookId, index) {
    const data = await ctx.request(
      `/api/freereels/drama/${enc(bookId)}/play/${Number(index) + 1}`,
      { lang: ctx.lang },
      codeAuth,
    );
    const url = data?.data?.data?.m3u8_url || firstVideoUrl(data?.data?.data, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    return browseTest(this, ctx, 'FreeReels');
  },
};

export const funDrama = {
  id: 'fundrama',
  hosts: [],
  label: 'FunDrama',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request(
      '/api/fundrama/dramas',
      { lang: ctx.lang, page, limit: 20 },
      codeAuth,
    );
    const items = dedupeShows(collectShows(data, { requireRich: false }));
    return { items, hasMore: items.length >= 20 };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/fundrama/search', { q, lang: ctx.lang }, codeAuth);
    return { items: dedupeShows(collectShows(data, { requireRich: false })), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/fundrama/drama/${enc(bookId)}/episodes`,
      { lang: ctx.lang },
      codeAuth,
    );
    const chapters = collectEpisodes(data, ctx.quality).map((ep) => ({
      index: ep.index,
      chapterId: ep.chapterId,
      name: ep.name,
      videoUrl: ep.videoUrl,
    }));
    return finish(bookId, chapters, chapters.length);
  },

  async streamUrl(ctx, bookId, index) {
    return firstStream(this, ctx, bookId, index);
  },

  async test(ctx) {
    return browseTest(this, ctx, 'FunDrama');
  },
};

function microShow(d) {
  return show({
    id: d.id,
    title: d.title,
    cover: d.cover,
    intro: d.description,
    episodes: d.total_episodes,
  });
}

export const microDrama = {
  id: 'microdrama',
  hosts: [],
  label: 'MicroDrama',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request(
      '/api/microdrama/list',
      { lang: ctx.lang, page, limit: 20 },
      codeAuth,
    );
    const list = Array.isArray(data?.data?.data) ? data.data.data : [];
    return { items: dedupeShows(list.map(microShow)), hasMore: page * 20 < toNumber(data?.data?.total, 0) };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/microdrama/search', { q, lang: ctx.lang }, codeAuth);
    const list = Array.isArray(data?.data?.data) ? data.data.data : [];
    return { items: dedupeShows(list.map(microShow)), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/microdrama/drama/${enc(bookId)}`,
      { lang: ctx.lang },
      codeAuth,
    );
    const total = toNumber(data?.data?.total_episodes, 0);
    const chapters = Array.from({ length: total }, (_, i) =>
      makeChapter(i, String(i + 1), `Episode ${i + 1}`, null),
    );
    return finish(bookId, chapters, total);
  },

  async streamUrl(ctx, bookId, index) {
    const data = await ctx.request(
      `/api/microdrama/play/${enc(bookId)}/${Number(index) + 1}`,
      { lang: ctx.lang },
      codeAuth,
    );
    const url = pickQuality(data?.data?.videos, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    return browseTest(this, ctx, 'MicroDrama');
  },
};

export const biliTv = {
  id: 'bilitv',
  hosts: [],
  label: 'BiliTV',

  async latest(ctx) {
    const data = await ctx.request('/api/bilitv/home', { lang: ctx.lang });
    const items = dedupeShows(collectShows(data, { requireRich: false }));
    return { items, hasMore: false };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/bilitv/search', { q, lang: ctx.lang });
    return { items: dedupeShows(collectShows(data, { requireRich: false })), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(`/api/bilitv/detail/${enc(bookId)}`, { lang: ctx.lang });
    const detail = data?.data ?? data;
    const list = Array.isArray(detail?.episodes) ? detail.episodes : null;
    const total =
      list?.length ||
      toNumber(
        firstValue(detail, ['total_episodes', 'totalEpisodes', 'episode_count', 'episodeCount']),
        0,
      );
    const chapters = Array.from({ length: total }, (_, i) =>
      makeChapter(i, String(i + 1), `Episode ${i + 1}`, null),
    );
    return finish(bookId, chapters, total);
  },

  async streamUrl(ctx, bookId, index) {
    const data = await ctx.request(
      `/api/bilitv/episode/${enc(bookId)}/${Number(index) + 1}`,
      { lang: ctx.lang },
    );
    const url = firstVideoUrl(data?.data ?? data, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    return browseTest(this, ctx, 'BiliTV');
  },
};

function stardustLang(lang) {
  return String(lang || '').includes('_') ? lang : 'en_US';
}

function stardustShow(d) {
  return show({
    id: d.vid,
    title: d.name,
    cover: d.cover,
    intro: d.intro,
    episodes: d.episode_total,
    plays: d.plays,
    tags: d.tag ? [d.tag] : [],
  });
}

export const stardustTv = {
  id: 'stardusttv',
  hosts: [],
  label: 'Stardusttv2',

  async latest(ctx, { page = 1 } = {}) {
    const list = await ctx.request('/video/hot-list', {
      page,
      page_size: 20,
      lang: stardustLang(ctx.lang),
    });
    const raw = Array.isArray(list) ? list : [];
    return { items: dedupeShows(raw.map(stardustShow)), hasMore: raw.length >= 20 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/video/search', {
      keyword: q,
      page,
      page_size: 20,
      lang: stardustLang(ctx.lang),
    });
    const raw = Array.isArray(data?.dramas) ? data.dramas : [];
    return {
      items: dedupeShows(raw.map(stardustShow)),
      hasMore: page < toNumber(data?.last_page, 0),
    };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request('/video/episodes', {
      vid: bookId,
      lang: stardustLang(ctx.lang),
    });
    const raw = Array.isArray(data?.episodes) ? data.episodes : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(indexFrom(ep.episode, i), ep.episode, ep.name || `Episode ${ep.episode}`, ep.m3u8),
    );
    return finish(bookId, chapters, toNumber(data?.episode_total, chapters.length));
  },

  async streamUrl(ctx, bookId, index) {
    return firstStream(this, ctx, bookId, index);
  },

  async test(ctx) {
    return browseTest(this, ctx, 'Stardusttv2');
  },
};

function shortswaveShow(d) {
  return show({
    id: d.drama_id,
    title: d.title,
    cover: d.cover,
    intro: d.description,
    episodes: d.chapters,
    plays: d.likes,
    tags: d.tags,
  });
}

export const shortSwave = {
  id: 'shortswave',
  hosts: [],
  label: 'ShortsWave',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/home', { page, lang: ctx.lang }, codeAuth);
    const raw = Array.isArray(data?.data) ? data.data : [];
    return { items: dedupeShows(raw.map(shortswaveShow)), hasMore: !!data?.has_next };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/search', { q, lang: ctx.lang }, codeAuth);
    const raw = Array.isArray(data?.data) ? data.data : [];
    return { items: dedupeShows(raw.map(shortswaveShow)), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/drama/${enc(bookId)}/episodes`,
      { id: bookId, lang: ctx.lang },
      codeAuth,
    );
    const raw = Array.isArray(data?.data) ? data.data : [];
    // The stream endpoint serves the playlist without the key, so the
    // playlist URL can go straight to the HLS proxy.
    const chapters = chaptersFrom(raw, (ep, i) => {
      const chapterId = ep.chapter_id;
      const videoUrl = `${ctx.base}/api/stream/${enc(bookId)}/${enc(chapterId)}/v.m3u8?lang=${enc(ctx.lang)}`;
      return makeChapter(indexFrom(ep.chapter_index, i), chapterId, ep.chapter_name, videoUrl);
    });
    return finish(bookId, chapters, chapters.length);
  },

  async streamUrl(ctx, bookId, index) {
    return firstStream(this, ctx, bookId, index);
  },

  async test(ctx) {
    return browseTest(this, ctx, 'ShortsWave');
  },
};

function novaRows(data) {
  return data?.rows ?? data?.data ?? data ?? [];
}

export const dramaNova = {
  id: 'dramanova',
  hosts: [],
  label: 'DramaNova',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request(
      '/api/home',
      { lang: ctx.lang, page, sort: 'views' },
      codeAuth,
    );
    return { items: dedupeShows(collectShows(novaRows(data), { requireRich: false })), hasMore: false };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/search', { q, lang: ctx.lang, page }, codeAuth);
    return { items: dedupeShows(collectShows(novaRows(data), { requireRich: false })), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/episodes/${enc(bookId)}`,
      { lang: ctx.lang },
      codeAuth,
    );
    const raw = Array.isArray(data?.episodes)
      ? data.episodes
      : Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.data)
          ? data.data
          : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(i, firstValue(ep, ['fileId', 'file_id', 'videoFileId']), ep.name || ep.title, null),
    ).filter((c) => c.chapterId && c.chapterId !== 'undefined');
    return finish(bookId, chapters, chapters.length);
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = pickChapter(data, index);
    if (!ep) throw httpError(502, 'Episode no longer exists upstream');
    const video = await ctx.request(`/api/video/${enc(ep.chapterId)}`, {}, codeAuth);
    const url = firstVideoUrl(video, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    return browseTest(this, ctx, 'DramaNova');
  },
};

function cubeShow(v) {
  return show({
    id: v.videoid,
    title: v.videoName || v.videoAliasName,
    cover: v.cover,
    intro: v.summary,
    episodes: v.totalEpisodeNum,
    tags: v.tagInfo,
  });
}

export const cubeTv = {
  id: 'cubetv',
  hosts: [],
  label: 'CubeTV',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/home', { lang: ctx.lang, navid: '', page }, codeAuth);
    const videos = (data?.rows || []).flatMap((row) => row?.videos || []);
    return { items: dedupeShows(videos.map(cubeShow)), hasMore: false };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/search', { lang: ctx.lang, q, page }, codeAuth);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return { items: dedupeShows(rows.map(cubeShow)), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(
      `/api/episodes/${enc(bookId)}`,
      { lang: ctx.lang },
      codeAuth,
    );
    const raw = Array.isArray(data?.rows) ? data.rows : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(
        indexFrom(ep.episodeNumber, i),
        ep.episodeid,
        ep.episodeTitle,
        pickQuality(ep.videoUrls, ctx.quality),
      ),
    );
    return finish(bookId, chapters, toNumber(data?.total, chapters.length));
  },

  async streamUrl(ctx, bookId, index) {
    return firstStream(this, ctx, bookId, index);
  },

  async test(ctx) {
    return browseTest(this, ctx, 'CubeTV');
  },
};

function happyShow(d) {
  return show({
    id: d.id,
    title: d.name,
    cover: d.cover || d.big_cover,
    intro: d.introduce,
    episodes: d.episode_num,
    plays: d.m_like_count,
  });
}

export const happyShort = {
  id: 'happyshort',
  hosts: [],
  label: 'HappyShort',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/hs/home', { page, size: 20, lang: ctx.lang });
    const raw = Array.isArray(data?.dramas) ? data.dramas : [];
    return { items: dedupeShows(raw.map(happyShow)), hasMore: !!data?.has_next };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/hs/search', { q, lang: ctx.lang });
    const raw = Array.isArray(data?.dramas) ? data.dramas : [];
    return { items: dedupeShows(raw.map(happyShow)), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request('/api/hs/episodes', { id: bookId, lang: ctx.lang });
    const raw = Array.isArray(data?.episodes) ? data.episodes : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(indexFrom(ep.order, i), ep.id, ep.name, null),
    );
    return finish(bookId, chapters, toNumber(data?.total, chapters.length));
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = pickChapter(data, index);
    if (!ep) throw httpError(502, 'Episode no longer exists upstream');
    // The play endpoint takes the episode id (not the order number).
    const play = await ctx.request(
      '/api/hs/play',
      { id: bookId, ep: ep.chapterId, lang: ctx.lang },
      codeAuth,
    );
    // cdn_url answers 403 for most titles; the OSS copy serves the file.
    const url = play?.oss_url || play?.url || play?.cdn_url;
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    return browseTest(this, ctx, 'HappyShort');
  },
};

function pineShow(c) {
  return show({
    id: c.collection_id,
    title: c.title,
    cover: c.cover,
    intro: c.description,
    episodes: c.total_episodes,
    plays: c.views,
    tags: c.tags,
  });
}

export const pineDrama = {
  id: 'pinedrama',
  hosts: [],
  label: 'PineDrama',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request(
      '/home',
      { scene: 1, count: 15, page, lang: ctx.lang },
      codeAuth,
    );
    const raw = Array.isArray(data?.collections) ? data.collections : [];
    return { items: dedupeShows(raw.map(pineShow)), hasMore: !!data?.has_more };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request(
      '/search',
      { q, count: 20, page, lang: ctx.lang },
      codeAuth,
    );
    const raw = Array.isArray(data?.results) ? data.results : [];
    return { items: dedupeShows(raw.map(pineShow)), hasMore: !!data?.has_more };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request('/detail', { id: bookId, lang: ctx.lang }, codeAuth);
    const raw = Array.isArray(data?.episodes) ? data.episodes : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(indexFrom(ep.episode_num, i), ep.episode_num ?? i + 1, `Episode ${ep.episode_num ?? i + 1}`, null),
    );
    return finish(bookId, chapters, toNumber(data?.total_episodes, chapters.length));
  },

  async streamUrl(ctx, bookId, index) {
    const data = await ctx.request(
      '/episode',
      { id: bookId, ep: Number(index) + 1, lang: ctx.lang },
      codeAuth,
    );
    const url = data?.best_url || data?.url || firstVideoUrl(data, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    return browseTest(this, ctx, 'PineDrama');
  },
};

function raptShow(d) {
  return show({
    id: d.id,
    title: d.title,
    cover: d.image,
    intro: d.desc,
    plays: d.view,
    tags: Array.isArray(d.classify) ? d.classify : [],
  });
}

export const raptDrama = {
  id: 'raptdrama',
  hosts: [],
  label: 'RaptDrama',

  async latest(ctx) {
    const data = await ctx.request('/api/raptdrama/trending', {});
    const raw = Array.isArray(data?.data) ? data.data : [];
    return { items: dedupeShows(raw.map(raptShow)), hasMore: false };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/raptdrama/search', { query: q, page });
    const raw = Array.isArray(data?.data?.results) ? data.data.results : [];
    return { items: dedupeShows(raw.map(raptShow)), hasMore: raw.length >= 15 };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request('/api/raptdrama/episodes', { id: bookId });
    const raw = Array.isArray(data?.data?.episodes) ? data.data.episodes : [];
    const chapters = chaptersFrom(raw, (ep, i) =>
      makeChapter(indexFrom(ep.idx, i), ep.cid ?? ep.idx, ep.msg, ep.src),
    );
    return finish(bookId, chapters, toNumber(data?.data?.total, chapters.length));
  },

  async streamUrl(ctx, bookId, index) {
    return firstStream(this, ctx, bookId, index);
  },

  async test(ctx) {
    return browseTest(this, ctx, 'RaptDrama');
  },
};

function bonusShow(d) {
  return show({
    id: d.id,
    title: d.title,
    cover: d.cover,
    intro: d.description,
    episodes: d.episode_total_num,
    tags: d.tags,
  });
}

export const bonusTv = {
  id: 'bonustv',
  hosts: [],
  label: 'BonusTV',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/v1/recommend', { page, lang: ctx.lang });
    const raw = Array.isArray(data?.data?.data) ? data.data.data : [];
    return { items: dedupeShows(raw.map(bonusShow)), hasMore: raw.length >= 20 };
  },

  async search(ctx, { q } = {}) {
    const data = await ctx.request('/api/v1/search', { q, lang: ctx.lang });
    const raw = Array.isArray(data?.data?.data) ? data.data.data : [];
    return { items: dedupeShows(raw.map(bonusShow)), hasMore: false };
  },

  async chapters(ctx, bookId) {
    const data = await ctx.request(`/api/v1/episodes/${enc(bookId)}`, { lang: ctx.lang });
    const chapters = collectEpisodes(data, ctx.quality);
    return finish(bookId, chapters, chapters.length);
  },

  async streamUrl(ctx, bookId, index) {
    const data = await this.chapters(ctx, bookId);
    const ep = pickChapter(data, index);
    if (ep?.videoUrl) return ep.videoUrl;
    const play = await ctx.request(
      `/api/v1/episode/${enc(bookId)}/${Number(index) + 1}`,
      { lang: ctx.lang },
    );
    const url = firstVideoUrl(play?.data ?? play, ctx.quality);
    if (!url) throw httpError(502, 'No stream URL returned for this episode');
    return url;
  },

  async test(ctx) {
    return browseTest(this, ctx, 'BonusTV');
  },
};
