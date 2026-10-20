import { httpError } from '../errors.js';

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid download id');
  return id;
}

export function registerDownloadRoutes(app, ctx) {
  const { downloads, profiles } = ctx;

  app.get('/api/downloads', async (req) => {
    profiles.requireAdmin(req);
    return { items: downloads.list() };
  });

  app.post('/api/downloads', async (req) => {
    profiles.requireAdmin(req);
    const body = req.body ?? {};
    const added = await downloads.enqueue(body.bookId, body.episodes);
    return { added };
  });

  app.delete('/api/downloads/:id', async (req) => {
    profiles.requireAdmin(req);
    downloads.remove(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/:id/retry', async (req) => {
    profiles.requireAdmin(req);
    downloads.retry(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/:id/pause', async (req) => {
    profiles.requireAdmin(req);
    await downloads.pause(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/:id/resume', async (req) => {
    profiles.requireAdmin(req);
    downloads.resume(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/pause-all', async (req) => {
    profiles.requireAdmin(req);
    await downloads.pauseAll();
    return { ok: true };
  });

  app.post('/api/downloads/resume-all', async (req) => {
    profiles.requireAdmin(req);
    downloads.resumeAll();
    return { ok: true };
  });

  app.post('/api/downloads/clear-completed', async (req) => {
    profiles.requireAdmin(req);
    return { ok: true, cleared: downloads.clearCompleted() };
  });
}
