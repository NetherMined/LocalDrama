import { httpError } from '../errors.js';
import { parseSeconds } from '../progress.js';

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid download id');
  return id;
}

export function registerProgressRoutes(app, ctx) {
  const { db, profiles, progress } = ctx;

  const save = async (req) => {
    const profile = profiles.requireProfile(req);
    const download = db.raw.prepare('SELECT * FROM downloads WHERE id = ?').get(parseId(req.params.downloadId));
    if (!download || download.status !== 'completed') throw httpError(404, 'Episode not found');
    const duration = parseSeconds(req.body?.duration, 'duration');
    if (!(duration > 0)) throw httpError(400, 'duration must be greater than 0');
    const position = Math.min(parseSeconds(req.body?.position, 'position'), duration);
    return { ok: true, progress: progress.save(profile.id, download, { position, duration }) };
  };

  app.put('/api/progress/:downloadId', save);
  // navigator.sendBeacon can only POST; behaviour is identical to PUT.
  app.post('/api/progress/:downloadId', save);

  app.get('/api/progress/continue', async (req) => {
    const profile = profiles.requireProfile(req);
    return { items: progress.continueWatching(profile.id) };
  });
}
