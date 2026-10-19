import { httpError } from '../errors.js';
import { parseType } from '../integrations.js';

export function registerIntegrationRoutes(app, ctx) {
  const { profiles, integrations } = ctx;

  app.post('/api/integrations/test', async (req) => {
    profiles.requireAdmin(req);
    const body = req.body ?? {};
    return integrations.test(parseType(body.type), body);
  });

  app.post('/api/integrations/refresh', async (req) => {
    profiles.requireAdmin(req);
    const result = await integrations.refreshNow(parseType(req.body?.type));
    if (!result.ok) throw httpError(502, result.error);
    return result;
  });
}
