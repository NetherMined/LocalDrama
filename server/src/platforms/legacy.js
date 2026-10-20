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

export const dramaBox = {
  id: 'dramabox',
  host: 'dramabox.goodbos.online',
  label: 'DramaBox',

  async latest(ctx, { page = 1 } = {}) {
    const data = await ctx.request('/api/dramabox/trending', { lang: ctx.lang, page });
    const raw = Array.isArray(data) ? data : data.data || data.results || data.items || [];
    const items = dedupe((Array.isArray(raw) ? raw : []).map(mapDramaBox));
    return { items, hasMore: items.length >= 10 };
  },

  async search(ctx, { q, page = 1 } = {}) {
    const data = await ctx.request('/api/dramabox/search', {
      query: q,
      lang: ctx.lang,
      page,
    });
    const raw = Array.isArray(data) ? data : data.data || data.results || data.items || [];
    const items = dedupe((Array.isArray(raw) ? raw : []).map(mapDramaBox));
    return { items, hasMore: items.length >= 10 };
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
