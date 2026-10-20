import { httpError } from '../errors.js';
import { parseSeconds } from '../progress.js';

const MAX_BOOK_ID = 200;

function parseBookId(value) {
  const bookId = String(value ?? '');
  if (!bookId || bookId.length > MAX_BOOK_ID) throw httpError(400, 'Invalid show id');
  return bookId;
}

function parseEpisodeIndex(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) throw httpError(400, 'Invalid episode index');
  return index;
}

function parseSource(value) {
  return typeof value === 'string' && value && value.length <= 64 ? value : null;
}

export function registerWatchRoutes(app, ctx) {
  const { db, profiles, progress } = ctx;

  const save = async (req) => {
    const profile = profiles.requireProfile(req);
    const bookId = parseBookId(req.params.bookId);
    const episodeIndex = parseEpisodeIndex(req.params.index);
    const duration = parseSeconds(req.body?.duration, 'duration');
    if (!(duration > 0)) throw httpError(400, 'duration must be greater than 0');
    const position = Math.min(parseSeconds(req.body?.position, 'position'), duration);
    const sourceId = parseSource(req.body?.source) ?? db.getShow(bookId)?.source ?? null;
    const saved = progress.saveStream(profile.id, bookId, episodeIndex, { position, duration, sourceId });
    return { ok: true, progress: saved };
  };

  app.put('/api/watch/:bookId/:index', save);
  // navigator.sendBeacon can only POST; behaviour is identical to PUT.
  app.post('/api/watch/:bookId/:index', save);

  app.get('/api/watch/continue', async (req) => {
    const profile = profiles.requireProfile(req);
    return { items: progress.streamContinue(profile.id) };
  });

  app.get('/api/watch/:bookId', async (req) => {
    const profile = profiles.requireProfile(req);
    return { items: progress.streamItems(profile.id, parseBookId(req.params.bookId)) };
  });
}
