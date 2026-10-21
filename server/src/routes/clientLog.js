import { httpError } from '../errors.js';
import { limiter } from './auth.js';

const BODY_LIMIT_BYTES = 4 * 1024;
const FIELD_MAX_CHARS = 300;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_POSTS = 30;
const EVENTS = new Set([
  'stream_url_failed',
  'media_error',
  'hls_fatal',
  'watchdog_timeout',
  'stall_timeout',
  'play_rejected',
  'fullscreen_failed',
]);

function text(value) {
  return typeof value === 'string' ? value.slice(0, FIELD_MAX_CHARS) : undefined;
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Keeps only the host of a URL so signed stream links never reach the log.
function hostOnly(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return new URL(value).hostname.slice(0, FIELD_MAX_CHARS);
  } catch {
    return value.split(/[/?#]/)[0].slice(0, FIELD_MAX_CHARS);
  }
}

function details(value) {
  if (typeof value === 'string') return text(value);
  if (value && typeof value === 'object') return text(JSON.stringify(value));
  return undefined;
}

export function registerClientLogRoutes(app) {
  const overRateLimit = limiter(RATE_WINDOW_MS, RATE_MAX_POSTS);

  app.post('/api/client-log', { bodyLimit: BODY_LIMIT_BYTES }, async (req, reply) => {
    const { account } = req;
    if (overRateLimit(String(account.id))) {
      throw httpError(429, 'Too many playback reports. Try again in a minute.');
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (!EVENTS.has(body.event)) throw httpError(400, 'Unknown client log event');

    const clientLog = {
      event: body.event,
      platform: text(body.platform),
      bookId: text(body.bookId),
      episode: number(body.episode),
      browser: text(body.browser),
      os: text(body.os),
      userAgent: text(body.userAgent),
      code: number(body.code),
      message: text(body.message),
      details: details(body.details),
      src: hostOnly(body.src),
    };
    req.log.warn({ clientLog, account: account.username }, 'client playback problem');
    return reply.code(204).send();
  });
}
