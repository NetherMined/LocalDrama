import { httpError } from '../errors.js';

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid download id');
  return id;
}

export function registerDownloadRoutes(app, ctx) {
  const { downloads } = ctx;

  app.get('/api/downloads', async () => ({ items: downloads.list() }));

  app.post('/api/downloads', async (req) => {
    const body = req.body ?? {};
    const added = await downloads.enqueue(body.bookId, body.episodes);
    return { added };
  });

  app.delete('/api/downloads/:id', async (req) => {
    downloads.remove(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/:id/retry', async (req) => {
    downloads.retry(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/:id/pause', async (req) => {
    await downloads.pause(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/:id/resume', async (req) => {
    downloads.resume(parseId(req.params.id));
    return { ok: true };
  });

  app.post('/api/downloads/pause-all', async () => {
    await downloads.pauseAll();
    return { ok: true };
  });

  app.post('/api/downloads/resume-all', async () => {
    downloads.resumeAll();
    return { ok: true };
  });

  app.post('/api/downloads/clear-completed', async () => ({ ok: true, cleared: downloads.clearCompleted() }));
}
