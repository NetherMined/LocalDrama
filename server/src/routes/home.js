import { httpError } from '../errors.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

export function registerHomeRoutes(app, ctx) {
  const { db, provider } = ctx;
  let cache = null;

  const SHELVES = [
    { key: 'trending', title: 'Trending Now', load: () => provider.trending() },
    { key: 'latest', title: 'Latest', load: async () => (await provider.latest(1)).items },
    { key: 'foryou', title: 'For You', load: () => provider.forYou() },
    { key: 'recommended', title: 'Recommended', load: () => provider.recommended() },
    { key: 'comingsoon', title: 'Coming Soon', load: () => provider.comingSoon() },
    { key: 'dubindo', title: 'Indonesian Dubbed', load: () => provider.dubIndo() },
    { key: 'vip', title: 'VIP', load: () => provider.vip() },
  ];

  async function build() {
    const rows = [];
    const errors = [];
    let firstError = null;

    for (const shelf of SHELVES) {
      try {
        const items = (await shelf.load()).filter((s) => s.bookId);
        rows.push({ key: shelf.key, title: shelf.title, items });
      } catch (err) {
        firstError ??= err;
        errors.push({ key: shelf.key, error: String(err?.message || err) });
      }
    }

    if (!rows.length && firstError) throw httpError(502, String(firstError.message || firstError));

    const all = rows.flatMap((r) => r.items);
    db.upsertShows(all);

    const trending = rows.find((r) => r.key === 'trending');
    const hero = trending?.items.find((s) => s.introduction) ?? null;

    return { hero, rows, errors };
  }

  app.get('/api/home', async (req) => {
    const refresh = req.query.refresh === '1';
    if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
    const value = await build();
    cache = { at: Date.now(), value };
    return value;
  });
}
