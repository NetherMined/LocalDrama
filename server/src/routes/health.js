import { getConfig } from '../config.js';
import { VERSION } from './system.js';

export function registerHealthRoutes(app, ctx) {
  const { db, provider } = ctx;

  app.get('/api/health', async (req, reply) => {
    let dbOk = true;
    try {
      db.raw.prepare('SELECT 1').get();
    } catch {
      dbOk = false;
    }

    if (!dbOk) reply.code(503);
    return {
      ok: dbOk,
      version: VERSION,
      uptime: Math.round(process.uptime()),
      configured: getConfig().configured,
      db: dbOk ? 'ok' : 'error',
      upstream: { ok: provider.health().ok },
    };
  });
}
