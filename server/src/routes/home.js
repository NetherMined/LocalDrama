import { getConfig } from '../config.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

export function registerHomeRoutes(app, ctx) {
  const { db, provider } = ctx;
  let cache = null;

  async function build() {
    const cfg = getConfig();
    const rows = [];
    const errors = [];

    // Latest from active source
    try {
      const latestRes = await provider.latest(1);
      const latest = latestRes?.items || [];
      if (latest.length) {
        rows.push({
          key: 'latest',
          title: 'Latest',
          source: cfg.activeSourceId,
          items: latest.slice(0, 24),
        });
      }
    } catch (err) {
      errors.push({ key: 'latest', error: String(err?.message || err) });
    }

    // Trending (reuse latest if dedicated method is empty)
    try {
      let trending = await provider.trending();
      if (!Array.isArray(trending) || trending.length === 0) {
        const latestRes = await provider.latest(1);
        trending = latestRes?.items || [];
      }
      if (trending.length) {
        rows.push({
          key: 'trending',
          title: 'Trending Now',
          source: cfg.activeSourceId,
          items: trending.slice(0, 24),
        });
      }
    } catch (err) {
      errors.push({ key: 'trending', error: String(err?.message || err) });
    }

    // Recommended / Interests
    try {
      const recommended = await provider.recommended();
      if (recommended?.length) {
        rows.push({
          key: 'interests',
          title: 'Based on your interests',
          source: cfg.activeSourceId,
          items: recommended.slice(0, 20),
        });
      }
    } catch (err) {
      errors.push({ key: 'interests', error: String(err?.message || err) });
    }

    const all = rows.flatMap((r) => r.items || []);
    if (all.length) db.upsertShows(all);

    const hero = rows[0]?.items?.find((s) => s.introduction || s.name) || rows[0]?.items?.[0] || null;

    return {
      hero,
      rows,
      errors,
      activeSourceId: cfg.activeSourceId,
    };
  }

  app.get('/api/home', async (req) => {
    const refresh = req.query.refresh === '1';
    if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
    const value = await build();
    cache = { at: Date.now(), value };
    return value;
  });
}
