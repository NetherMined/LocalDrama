import { httpError } from './errors.js';
import {
  adapterById,
  adapterForHost,
  platformLabel,
  supportedPlatformNames,
} from './platforms/index.js';
import { hostOf, platformContext } from './platforms/common.js';

const DEFAULT_LANG = 'en';

function adapterFor(source) {
  const host = hostOf(source);
  const adapter =
    adapterForHost(host) || adapterById(source?.config?.platform);
  if (!adapter) throw unsupported(source);
  return adapter;
}

export function platformKind(source) {
  const host = hostOf(source || {});
  return (
    (adapterForHost(host) || adapterById(source?.config?.platform))?.id || 'unsupported'
  );
}

function unsupported(source) {
  const name = platformLabel(source);
  return httpError(
    501,
    `${name} is not supported yet. Supported GoodBos platforms: ${supportedPlatformNames().join(', ')}.`,
  );
}

function optsFor(source, options = {}) {
  return {
    source,
    apiKey: String(options.apiKey || ''),
    lang: String(options.lang || DEFAULT_LANG),
    quality: Number(options.quality) || 720,
    page: options.page,
    q: options.q,
  };
}

export async function platformLatest(source, options = {}) {
  const adapter = adapterFor(source);
  const opts = optsFor(source, options);
  return adapter.latest(platformContext(source, opts), opts);
}

export async function platformSearch(source, options = {}) {
  const adapter = adapterFor(source);
  const opts = optsFor(source, options);
  return adapter.search(platformContext(source, opts), opts);
}

export async function platformChapters(source, bookId, options = {}) {
  const adapter = adapterFor(source);
  const opts = optsFor(source, options);
  return adapter.chapters(platformContext(source, opts), String(bookId));
}

export async function platformStreamUrl(source, bookId, index, options = {}) {
  const adapter = adapterFor(source);
  const opts = optsFor(source, options);
  return adapter.streamUrl(platformContext(source, opts), String(bookId), Number(index));
}

export async function testPlatform(config = {}) {
  const source = { config };
  const ctx = platformContext(source, config);
  try {
    const adapter = adapterFor(source);
    const result = await adapter.test(ctx);
    if (!result.ok) return result;

    // A source is only usable when the whole path works: browse -> episodes
    // -> a reachable video URL. The per-platform checks above are cheap, so
    // this final smoke test catches expired/blocked playback endpoints.
    const latest = await adapter.latest(ctx, { page: 1 });
    const first = latest.items?.[0];
    if (!first) return { ok: false, error: 'No dramas returned by the platform' };
    const chapters = await adapter.chapters(ctx, first.bookId);
    const episode = chapters.chapters?.[0];
    if (!episode) return { ok: false, error: 'Episode list is empty' };
    const url =
      episode.videoUrl || (await adapter.streamUrl(ctx, first.bookId, episode.index));
    if (!url) return { ok: false, error: 'No playable stream returned' };
    const res = await fetch(url, {
      headers: {
        Range: 'bytes=0-0',
        'User-Agent': 'Mozilla/5.0 LocalDrama/0.1',
      },
      signal: AbortSignal.timeout(30000),
    });
    await res.body?.cancel().catch(() => {});
    if (!res.ok) return { ok: false, error: `Stream HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
