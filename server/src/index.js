import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, getConfig, loadConfig } from './config.js';
import { openDb } from './db.js';
import { createAuth } from './auth.js';
import { createProvider } from './provider.js';
import { createDownloadManager } from './downloads.js';
import { createLibrary } from './library.js';
import { createEvents } from './events.js';
import { createProfiles } from './profiles.js';
import { createProgress } from './progress.js';
import { createIntegrations } from './integrations.js';
import { createMdns } from './mdns.js';
import { sendRanged } from './stream.js';
import { installHttpsPatch, setProxy } from './proxy.js';
import { lanUrls, registerSystemRoutes, VERSION } from './routes/system.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBrowseRoutes } from './routes/browse.js';
import { registerHomeRoutes } from './routes/home.js';
import { registerDownloadRoutes } from './routes/downloads.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerProgressRoutes } from './routes/progress.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSourceRoutes } from './routes/sources.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(HERE, '..', '..', 'web', 'dist');
const FIXTURES_DIR = path.resolve(HERE, '..', 'fixtures');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 8096;
const MOCK = process.env.DRAMABOX_MOCK === '1';
const MOCK_FLAKY = process.env.DRAMABOX_MOCK_FLAKY === '1';
const MOCK_BYTES_PER_SEC = 24 * 1024;
const PUBLIC_API = new Set(['/api/status', '/api/health']);

const config = loadConfig();
const db = openDb(DATA_DIR);
const auth = createAuth(db.raw);
const events = createEvents();
installHttpsPatch();
try {
  await setProxy(config.proxyUrl);
} catch (err) {
  console.error(`Ignoring proxy setting: ${err.message}`);
  await setProxy('');
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

const provider = createProvider({
  mock: MOCK,
  port: PORT,
  language: config.language,
  requestDelay: config.requestDelay,
  proxyUrl: config.proxyUrl,
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
  if (getConfig().passwordHash && !auth.isAuthenticated(req)) return reply.code(401).send({ error: 'unauthorized' });
});

app.addHook('onRequest', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/') || PUBLIC_API.has(url) || url.startsWith('/api/setup')) return;
  if (!getConfig().configured) return reply.code(409).send({ error: 'not_configured' });
});

registerSystemRoutes(app, ctx);
registerHealthRoutes(app, ctx);
registerAuthRoutes(app, ctx);
registerProfileRoutes(app, ctx);
registerProgressRoutes(app, ctx);
registerIntegrationRoutes(app, ctx);
registerSourceRoutes(app, ctx);
registerBrowseRoutes(app, ctx);
registerHomeRoutes(app, ctx);
registerDownloadRoutes(app, ctx);
registerLibraryRoutes(app, ctx);
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
  await app.register(fastifyStatic, { root: WEB_DIST });
}

app.setNotFoundHandler((req, reply) => {
  const url = req.url.split('?')[0];
  const isAppRoute = !url.startsWith('/api/') && !url.startsWith('/media/') && !url.startsWith('/__mock/');
  if (hasWebDist && req.method === 'GET' && isAppRoute) return reply.sendFile('index.html');
  return reply.code(404).send({ error: 'Not found' });
});

if (getConfig().configured) {
  try {
    const scanned = await library.scan();
    app.log.info(`Library scan: ${scanned.added} added, ${scanned.removed} removed`);
  } catch (err) {
    app.log.warn(`Library scan failed: ${err.message}`);
  }
}

await app.listen({ host: HOST, port: PORT });
app.log.info(`Dramabox Server listening on ${HOST}:${PORT}${MOCK ? ' (mock mode)' : ''}`);
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
