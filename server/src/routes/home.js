import { httpError } from '../errors.js';
import { getConfig } from '../config.js';

const CACHE_TTL_MS = 10 * 60 * 1000;

export function registerHomeRoutes(app, ctx) {
  const { db, provider } = ctx;
  let cache = null;

  async function build() {
    const cfg = getConfig();
    const sources = cfg.sources || [];
    const rows = [];
    const errors = [];

    // Continue watching is handled separately on the client via /api/progress/continue
    // Interests: simple tag-based or recommended from current provider for now
    try {
      const recommended = await provider.recommended();
      if (recommended?.length) {
        rows.push({
          key: 'interests',
          title: 'Based on your interests',
          source: 'dramabox',
          items: recommended.slice(0, 20),
        });
      }
    } catch (err) {
      errors.push({ key: 'interests', error: String(err?.message || err) });
    }

    // Latest from each enabled source (currently only dramabox is fully implemented)
    for (const source of sources.filter((s) => s.enabled)) {
      try {
        if (source.type === 'dramabox') {
          const latest = (await provider.latest(1)).items || [];
          if (latest.length) {
            rows.push({
              key: `latest-${source.id}`,
              title: `Latest · ${source.name}`,
              source: source.id,
              items: latest.slice(0, 20),
            });
          }
        } else {
          // Placeholder for other sources — full provider switch comes next
          rows.push({
            key: `latest-${source.id}`,
            title: `Latest · ${source.name}`,
            source: source.id,
            items: [],
            note: 'Full browsing for this source is coming soon',
          });
        }
      } catch (err) {
        errors.push({ key: source.id, error: String(err?.message || err) });
      }
    }

    // Classic shelves from the active provider
    const classic = [
      { key: 'trending', title: 'Trending Now', load: () => provider.trending() },
      { key: 'foryou', title: 'For You', load: () => provider.forYou() },
      { key: 'vip', title: 'VIP', load: () => provider.vip() },
    ];
    for (const shelf of classic) {
      try {
        const items = (await shelf.load()).filter((s) => s.bookId);
        if (items.length) rows.push({ key: shelf.key, title: shelf.title, source: cfg.activeSourceId, items });
      } catch (err) {
        errors.push({ key: shelf.key, error: String(err?.message || err) });
      }
    }

    const all = rows.flatMap((r) => r.items || []);
    if (all.length) db.upsertShows(all);

    const heroSource = rows.find((r) => r.items?.length && r.items[0].introduction);
    const hero = heroSource?.items.find((s) => s.introduction) ?? null;

    return {
      hero,
      rows,
      errors,
      sources: sources.map((s) => ({ id: s.id, name: s.name, type: s.type, enabled: s.enabled })),
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
