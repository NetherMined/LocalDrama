import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, getConfig, isKeyOnly, loadConfig, saveConfig } from './config.js';
import { openDb } from './db.js';
import { createAuth } from './auth.js';
import { createAccounts } from './accounts.js';
import { createMultiProvider } from './multiProvider.js';
import { createDownloadManager } from './downloads.js';
import { createLibrary } from './library.js';
import { createEvents } from './events.js';
import { createProfiles } from './profiles.js';
import { createProgress } from './progress.js';
import { createIntegrations } from './integrations.js';
import { createMdns } from './mdns.js';
import { sendRanged } from './stream.js';
import { lanUrls, registerSystemRoutes, checkWritableDir, VERSION } from './routes/system.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerBrowseRoutes } from './routes/browse.js';
import { registerHomeRoutes } from './routes/home.js';
import { registerDownloadRoutes } from './routes/downloads.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerProgressRoutes } from './routes/progress.js';
import { registerWatchRoutes } from './routes/watch.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSourceRoutes } from './routes/sources.js';
import { registerFavouriteRoutes } from './routes/favourites.js';
import { registerHlsRoutes } from './routes/hls.js';
import { registerClientLogRoutes } from './routes/clientLog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(HERE, '..', '..', 'web', 'dist');
const FIXTURES_DIR = path.resolve(HERE, '..', 'fixtures');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 8096;
const MOCK = process.env.DRAMABOX_MOCK === '1';
const MOCK_FLAKY = process.env.DRAMABOX_MOCK_FLAKY === '1';
const MOCK_BYTES_PER_SEC = 24 * 1024;
const PUBLIC_API = new Set(['/api/status', '/api/health']);
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/account', '/api/account/password', '/api/status', '/api/auth/logout']);

const config = loadConfig();
const db = openDb(DATA_DIR, { legacyPasswordHash: config.passwordHash });
const auth = createAuth(db.raw);
const events = createEvents();
const accounts = createAccounts(db, { events });
await accounts.seedDefaultAdmin();

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

const sourceRepair = db.repairShowSources();
app.log.info(`Show source repair: ${sourceRepair.relabelled} DramaBuzz rows set to dramabox, ${sourceRepair.filled} unlabelled DramaBox rows set to dramabox`);

if (isKeyOnly(config.sources?.find((s) => s.id === config.activeSourceId))) {
  saveConfig({ activeSourceId: 'dramabox' });
  app.log.info('Active source pointed at the shared key entry (dramabuzz); switched to dramabox');
}

const provider = createMultiProvider({
  mock: MOCK,
  port: PORT,
  language: config.language,
  requestDelay: config.requestDelay,
  resolveShowSource: (bookId) => db.getShow(bookId)?.source || null,
});
const profiles = createProfiles(db);
const progress = createProgress({ db });
const integrations = createIntegrations({ getConfig, log: app.log });
const mdns = createMdns({ getConfig, port: PORT, version: VERSION, log: app.log });
const library = createLibrary({ db, getConfig, events });
const downloads = createDownloadManager({ db, provider, events, getConfig, library, integrations });
downloads.init();

const ctx = {
  db,
  provider,
  downloads,
  events,
  library,
  auth,
  accounts,
  profiles,
  progress,
  integrations,
  mdns,
  port: PORT,
  mock: MOCK,
};

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  reply.code(status).send({ error: err.message });
});

app.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
  try {
    done(null, body ? JSON.parse(body) : {});
  } catch {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    done(err);
  }
});

app.addHook('onRequest', async (req, reply) => {
  const url = req.url.split('?')[0];
  const guarded = url.startsWith('/api/') || url.startsWith('/media/');
  if (!guarded || PUBLIC_API.has(url) || url.startsWith('/api/auth/')) return;
  if (url.startsWith('/api/setup') && !getConfig().configured) return;
  const account = auth.accountFromRequest(req);
  if (!account) return reply.code(401).send({ error: 'sign_in_required' });
  if (account.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(url)) {
    return reply.code(403).send({ error: 'password_change_required' });
  }
  req.account = account;
});

app.addHook('onRequest', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/') || PUBLIC_API.has(url) || url.startsWith('/api/setup')) return;
  if (!getConfig().configured) return reply.code(409).send({ error: 'not_configured' });
});

registerSystemRoutes(app, ctx);
registerHealthRoutes(app, ctx);
registerAuthRoutes(app, ctx);
registerAccountRoutes(app, ctx);
registerAdminRoutes(app, ctx);
registerProfileRoutes(app, ctx);
registerProgressRoutes(app, ctx);
registerWatchRoutes(app, ctx);
registerIntegrationRoutes(app, ctx);
registerSourceRoutes(app, ctx);
registerBrowseRoutes(app, ctx);
registerHlsRoutes(app);
registerHomeRoutes(app, ctx);
registerDownloadRoutes(app, ctx);
registerLibraryRoutes(app, ctx);
registerFavouriteRoutes(app, ctx);
registerClientLogRoutes(app);
app.get('/api/events', (req, reply) => {
  events.subscribe(req, reply);
});

if (MOCK) {
  const flakySeen = new Set();
  app.get('/__mock/sample.mp4', (req, reply) => {
    const key = String(req.query.n ?? '');
    if (MOCK_FLAKY && !flakySeen.has(key)) {
      flakySeen.add(key);
      return reply.code(503).send({ error: 'mock transient failure' });
    }
    return sendRanged(req, reply, path.join(FIXTURES_DIR, 'sample.mp4'), { bytesPerSec: MOCK_BYTES_PER_SEC });
  });
}

const hasWebDist = fs.existsSync(path.join(WEB_DIST, 'index.html'));
if (hasWebDist) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    cacheControl: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', path.basename(filePath) === 'sw.js' ? 'no-cache' : 'public, max-age=0');
    },
  });
}

app.setNotFoundHandler((req, reply) => {
  const url = req.url.split('?')[0];
  const isAppRoute = !url.startsWith('/api/') && !url.startsWith('/media/') && !url.startsWith('/__mock/');
  if (hasWebDist && req.method === 'GET' && isAppRoute) return reply.sendFile('index.html');
  return reply.code(404).send({ error: 'Not found' });
});

if (getConfig().configured) {
  if (getConfig().downloadRoot) {
    const check = await checkWritableDir(getConfig().downloadRoot);
    if (!check.ok) app.log.error(`Download folder is not writable: ${check.error}`);
  }
  try {
    const scanned = await library.scan();
    app.log.info(`Library scan: ${scanned.added} added, ${scanned.removed} removed`);
  } catch (err) {
    app.log.warn(`Library scan failed: ${err.message}`);
  }
}

await app.listen({ host: HOST, port: PORT });
app.log.info(`LocalDrama Server listening on ${HOST}:${PORT}${MOCK ? ' (mock mode)' : ''}`);
app.log.info(`Data directory: ${DATA_DIR}`);
for (const url of lanUrls(PORT)) app.log.info(`LAN: ${url}`);
if (!hasWebDist) app.log.warn('web/dist not found; UI is not being served');

mdns.sync();
downloads.kick();

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    mdns.shutdown();
    await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    process.exit(0);
  });
}
