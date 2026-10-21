import { Readable } from 'node:stream';
import { httpError } from '../errors.js';

const PRIVATE_HOSTS =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|::1|metadata\.google\.internal)/i;
const MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;

function isPrivateHost(hostname) {
  return PRIVATE_HOSTS.test(String(hostname || '')) || /\.local$/i.test(hostname || '');
}

export function hlsProxyUrl(absolute, token) {
  return `/api/hls?url=${encodeURIComponent(absolute)}&t=${encodeURIComponent(token)}`;
}

function proxyUrl(raw, base, token) {
  let absolute;
  try {
    absolute = new URL(raw, base).toString();
  } catch {
    return raw;
  }
  return hlsProxyUrl(absolute, token);
}

function rewritePlaylist(text, base, token) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${proxyUrl(uri, base, token)}"`);
      }
      return proxyUrl(trimmed, base, token);
    })
    .join('\n');
}

function looksLikePlaylist(url, contentType) {
  return (
    /mpegurl|m3u8/i.test(contentType || '') ||
    /\.m3u8(\?|$)/i.test(url) ||
    /[?&](format|type)=m3u8/i.test(url)
  );
}

export function registerHlsRoutes(app, ctx) {
  const { entitlements } = ctx;
  app.get('/api/hls', async (req, reply) => {
    const token = String(req.query?.t || '');
    if (!entitlements.checkStreamToken(token, req.account?.id)) throw httpError(403, 'stream_token_invalid');

    const raw = String(req.query?.url || '');
    if (!raw) throw httpError(400, 'url is required');

    let target;
    try {
      target = new URL(raw);
    } catch {
      throw httpError(400, 'Invalid url');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw httpError(400, 'Only http and https streams are allowed');
    }
    if (isPrivateHost(target.hostname)) throw httpError(400, 'Private hosts are not allowed');

    const headers = {
      Accept: '*/*',
      'User-Agent': 'Mozilla/5.0 LocalDrama/0.1',
      Referer: `${target.origin}/`,
    };
    if (req.headers.range) headers.Range = req.headers.range;

    let upstream;
    try {
      upstream = await fetch(target, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(60000),
      });
    } catch (err) {
      throw httpError(502, `HLS upstream failed: ${err?.message || err}`);
    }

    if (!upstream.ok) {
      throw httpError(502, `HLS upstream HTTP ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const playlist = looksLikePlaylist(upstream.url, contentType);

    if (playlist) {
      const text = await upstream.text();
      if (text.length > MAX_PLAYLIST_BYTES) throw httpError(502, 'HLS playlist is too large');
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-store');
      reply.header('Access-Control-Allow-Origin', '*');
      return reply.send(rewritePlaylist(text, upstream.url, token));
    }

    reply.code(upstream.status === 206 ? 206 : 200);
    reply.header('Content-Type', contentType || 'application/octet-stream');
    reply.header('Cache-Control', 'no-store');
    reply.header('Access-Control-Allow-Origin', '*');
    const length = upstream.headers.get('content-length');
    const range = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (length) reply.header('Content-Length', length);
    if (range) reply.header('Content-Range', range);
    if (acceptRanges) reply.header('Accept-Ranges', acceptRanges);

    return reply.send(Readable.fromWeb(upstream.body));
  });
}
