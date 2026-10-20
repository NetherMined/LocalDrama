import { httpError } from '../errors.js';
import { clearProfileCookie, profileCookie } from '../profiles.js';

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid profile id');
  return id;
}

export function registerProfileRoutes(app, ctx) {
  const { profiles } = ctx;

  app.get('/api/profiles', async (req) => ({ items: profiles.list(req.account) }));

  app.post('/api/profiles/signout', async (req, reply) => {
    profiles.signout(req);
    reply.header('Set-Cookie', clearProfileCookie());
    return { ok: true };
  });

  app.post('/api/profiles/:id/select', async (req, reply) => {
    const { profile, token } = await profiles.select(parseId(req.params.id), req.body?.pin, req.account);
    reply.header('Set-Cookie', profileCookie(token));
    return { profile };
  });

  app.post('/api/profiles', async (req) => {
    return { profile: await profiles.create(req.account, req.body ?? {}) };
  });

  app.put('/api/profiles/:id', async (req) => {
    return { profile: await profiles.update(parseId(req.params.id), req.body ?? {}, req.account) };
  });

  app.delete('/api/profiles/:id', async (req) => {
    return profiles.remove(parseId(req.params.id), req.account);
  });
}
