import { getConfig } from '../config.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

export function registerHomeRoutes(app, ctx) {
  const { db, provider } = ctx;
  let cache = null;

  async function build() {
    const cfg = getConfig();
    const rows = [];
    const errors = [];
    const enabled = (cfg.sources || []).filter((s) => s.enabled);

    // One Latest row per enabled source
    for (const source of enabled) {
      try {
        // Temporarily note: multiProvider uses the active source.
        // For true per-source rows we would need a source-aware provider.
        // For now, only the active source returns real data; others are skipped or placeholder.
        if (source.id === cfg.activeSourceId) {
          const res = await provider.latest(1);
          const items = res?.items || [];
          if (items.length) {
            rows.push({
              key: `latest-${source.id}`,
              title: `Latest · ${source.name}`,
              source: source.id,
              items: items.slice(0, 24),
            });
          }
        }
      } catch (err) {
        errors.push({ key: source.id, error: String(err?.message || err) });
      }
    }

    // Trending from active source
    try {
      let trending = await provider.trending();
      if (!Array.isArray(trending) || trending.length === 0) {
        const res = await provider.latest(1);
        trending = res?.items || [];
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

    const all = rows.flatMap((r) => r.items || []);
    if (all.length) db.upsertShows(all);

    const hero = rows[0]?.items?.find((s) => s.introduction || s.name) || rows[0]?.items?.[0] || null;

    return {
      hero,
      rows,
      errors,
      activeSourceId: cfg.activeSourceId,
      sources: enabled.map((s) => ({ id: s.id, name: s.name, type: s.type })),
    };
  }

  app.get('/api/home', async (req) => {
    const refresh = req.query.refresh === '1';
    const cfg = getConfig();
    // Switching sources or toggling platforms must not serve the old home
    // payload for five minutes.
    const signature = [
      cfg.activeSourceId,
      ...(cfg.sources || []).filter((s) => s.enabled).map((s) => s.id),
    ].join('|');
    if (!refresh && cache && cache.signature === signature && Date.now() - cache.at < CACHE_TTL_MS) {
      return cache.value;
    }
    const value = await build();
    cache = { at: Date.now(), value, signature };
    return value;
  });
}
