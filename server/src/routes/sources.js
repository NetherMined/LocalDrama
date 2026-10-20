import { getConfig, saveConfig } from '../config.js';
import { listSourceTypes, testSource } from '../sources.js';
import { platformKind } from '../goodbosPlatforms.js';
import { httpError } from '../errors.js';

function sharedApiKey(cfg) {
  return (cfg.sources || []).find((s) => s.type === 'dramabuzz' && s.config?.apiKey)?.config?.apiKey || '';
}

export function registerSourceRoutes(app, ctx) {
  app.get('/api/sources', async (req) => {
    ctx.profiles.requireAdmin(req);
    const cfg = getConfig();
    return {
      activeSourceId: cfg.activeSourceId,
      types: listSourceTypes(),
      sources: cfg.sources.map((s) => ({
        ...s,
        config: {
          ...s.config,
          apiKey: s.config.apiKey ? '***' : '',
          proxyUrl: s.config.proxyUrl ? '***' : '',
        },
      })),
    };
  });

  app.post('/api/sources/:id/test', async (req) => {
    ctx.profiles.requireAdmin(req);
    const id = req.params.id;
    const cfg = getConfig();
    const source = cfg.sources.find((s) => s.id === id);
    if (!source) throw httpError(404, 'Source not found');

    const health = await testSource(source.type, {
      ...source.config,
      apiKey: source.config.apiKey || sharedApiKey(cfg),
    });
    const sources = cfg.sources.map((s) => (s.id === id ? { ...s, lastHealth: health } : s));
    saveConfig({ sources });
    return health;
  });

  app.post('/api/sources/:id/activate', async (req) => {
    ctx.profiles.requireAdmin(req);
    const id = req.params.id;
    const cfg = getConfig();
    const source = cfg.sources.find((s) => s.id === id);
    if (!source) throw httpError(404, 'Source not found');
    if (!source.enabled) throw httpError(400, 'Source is not enabled');
    if (source.type === 'goodbos' && platformKind(source) === 'unsupported') {
      throw httpError(400, 'This platform is not supported yet. Supported GoodBos platforms: DramaBox and NetShort.');
    }

    saveConfig({ activeSourceId: id });
    // Notify the provider layer if it supports switching (to be wired)
    if (ctx.provider?.setActiveSource) ctx.provider.setActiveSource(id);
    return { ok: true, activeSourceId: id };
  });

  app.put('/api/sources/:id', async (req) => {
    ctx.profiles.requireAdmin(req);
    const id = req.params.id;
    const body = req.body ?? {};
    const cfg = getConfig();
    const source = cfg.sources.find((s) => s.id === id);
    if (!source) throw httpError(404, 'Source not found');

    const next = {
      ...source,
      enabled: body.enabled !== undefined ? !!body.enabled : source.enabled,
      config: { ...source.config, ...(body.config || {}) },
    };
    // Don't store masked values
    if (next.config.apiKey === '***') next.config.apiKey = source.config.apiKey;
    if (next.config.proxyUrl === '***') next.config.proxyUrl = source.config.proxyUrl;

    const sources = cfg.sources.map((s) => (s.id === id ? next : s));
    saveConfig({ sources });
    return { ok: true };
  });
}
