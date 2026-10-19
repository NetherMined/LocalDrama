import fs from 'node:fs';
import { getConfig } from '../config.js';
import { VERSION } from './system.js';

const EMPTY_QUEUE = { queued: 0, downloading: 0, paused: 0, failed: 0 };

export function registerHealthRoutes(app, ctx) {
  const { db, provider } = ctx;

  app.get('/api/health', async (req, reply) => {
    const cfg = getConfig();
    let dbOk = true;
    let queue = { ...EMPTY_QUEUE };
    try {
      db.raw.prepare('SELECT 1').get();
      for (const row of db.raw.prepare('SELECT status, COUNT(*) AS n FROM downloads WHERE cleared = 0 GROUP BY status').all()) {
        if (row.status in queue) queue[row.status] = row.n;
      }
    } catch {
      dbOk = false;
    }

    let disk = null;
    if (cfg.downloadRoot) {
      try {
        const s = await fs.promises.statfs(cfg.downloadRoot);
        disk = { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
      } catch {
        disk = null;
      }
    }

    if (!dbOk) reply.code(503);
    return {
      ok: dbOk,
      version: VERSION,
      uptime: Math.round(process.uptime()),
      configured: cfg.configured,
      db: dbOk ? 'ok' : 'error',
      queue,
      upstream: { ok: provider.health().ok },
      disk,
    };
  });
}
