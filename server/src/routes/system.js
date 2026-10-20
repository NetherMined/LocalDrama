import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import DramaboxClient from '@zhadev/dramabox';
import { getConfig, saveConfig } from '../config.js';
import { httpError } from '../errors.js';
import { buildAgent, getProxyUrl, maskProxyUrl, parseProxyUrl, setProxy } from '../proxy.js';
import { maskSecret, normalizeUrl, resolveSecret } from '../integrations.js';
import { isWindowsPath } from '../paths.js';

const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8'));
export const VERSION = pkg.version;
const PLEX_SECTION_RE = /^\d*$/;

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'in', label: 'Indonesian' },
  { code: 'zh', label: 'Chinese' },
  { code: 'zhHans', label: 'Chinese (Simplified)' },
  { code: 'ko', label: 'Korean' },
  { code: 'ja', label: 'Japanese' },
  { code: 'tl', label: 'Filipino' },
  { code: 'th', label: 'Thai' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
];
const LANGUAGE_CODES = new Set(LANGUAGES.map((l) => l.code));
const QUALITIES = new Set([144, 360, 540, 720, 1080]);

export function lanUrls(port) {
  const urls = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) urls.push(`http://${info.address}:${port}`);
    }
  }
  return urls;
}

export async function checkWritableDir(input) {
  const str = typeof input === 'string' ? input.trim() : '';
  if (!str) return { ok: false, error: 'Enter a folder path', resolved: '' };
  if (process.platform !== 'win32' && isWindowsPath(str)) {
    return {
      ok: false,
      error: 'This is a Windows path, but the server is running in Linux (for example in Docker). Use a path inside the container, such as /media.',
      resolved: str,
    };
  }
  const resolved = path.resolve(str);
  try {
    await fs.promises.mkdir(resolved, { recursive: true });
    const probe = path.join(resolved, `.dramabox-write-test-${crypto.randomUUID()}`);
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.unlink(probe);
    return { ok: true, resolved };
  } catch (err) {
    return { ok: false, error: `Cannot write to this folder: ${err.message}`, resolved };
  }
}

function resolveIncomingProxy(input) {
  if (input === undefined) return undefined;
  const value = String(input ?? '').trim();
  if (value && value === maskProxyUrl(getConfig().proxyUrl)) return getConfig().proxyUrl;
  try {
    return parseProxyUrl(value);
  } catch (err) {
    throw httpError(400, err.message);
  }
}

function providerOptions() {
  const { language, requestDelay, proxyUrl } = getConfig();
  return { language, requestDelay, proxyUrl };
}

async function applyProxy() {
  try {
    await setProxy(getConfig().proxyUrl);
  } catch (err) {
    throw httpError(400, err.message);
  }
}

function parseSettings(body, { requireLanguage }) {
  const patch = {};
  if (body.language !== undefined || requireLanguage) {
    if (!LANGUAGE_CODES.has(body.language)) throw httpError(400, 'Unknown language');
    patch.language = body.language;
  }
  if (body.requestDelay !== undefined) {
    const n = Number(body.requestDelay);
    if (!Number.isInteger(n) || n < 0 || n > 60000) throw httpError(400, 'requestDelay must be 0-60000 ms');
    patch.requestDelay = n;
  }
  if (body.concurrency !== undefined) {
    const n = Number(body.concurrency);
    if (!Number.isInteger(n) || n < 1 || n > 4) throw httpError(400, 'concurrency must be 1-4');
    patch.concurrency = n;
  }
  if (body.quality !== undefined) {
    const n = Number(body.quality);
    if (!QUALITIES.has(n)) throw httpError(400, 'quality must be one of 144, 360, 540, 720, 1080');
    patch.quality = n;
  }
  if (body.mdns !== undefined) {
    if (typeof body.mdns !== 'boolean') throw httpError(400, 'mdns must be true or false');
    patch.mdns = body.mdns;
  }
  const proxy = resolveIncomingProxy(body.proxyUrl);
  if (proxy !== undefined) patch.proxyUrl = proxy;
  return patch;
}

function parseIntegrations(input, current) {
  if (!input || typeof input !== 'object') throw httpError(400, 'integrations must be an object');
  const next = structuredClone(current);
  if (input.jellyfin !== undefined) {
    const j = input.jellyfin ?? {};
    next.jellyfin = {
      enabled: j.enabled === undefined ? current.jellyfin.enabled : !!j.enabled,
      url: j.url === undefined ? current.jellyfin.url : normalizeUrl(j.url),
      apiKey: resolveSecret(j.apiKey, current.jellyfin.apiKey),
    };
    if (next.jellyfin.enabled && !next.jellyfin.url) throw httpError(400, 'Jellyfin URL is required when enabled');
  }
  if (input.plex !== undefined) {
    const p = input.plex ?? {};
    const sectionId = p.sectionId === undefined ? current.plex.sectionId : String(p.sectionId ?? '').trim();
    if (!PLEX_SECTION_RE.test(sectionId)) throw httpError(400, 'Plex section id must be numeric');
    next.plex = {
      enabled: p.enabled === undefined ? current.plex.enabled : !!p.enabled,
      url: p.url === undefined ? current.plex.url : normalizeUrl(p.url),
      token: resolveSecret(p.token, current.plex.token),
      sectionId,
    };
    if (next.plex.enabled && !next.plex.url) throw httpError(400, 'Plex URL is required when enabled');
  }
  return next;
}

function publicConfig(ctx) {
  const { passwordHash, integrations, ...rest } = getConfig();
  const jf = integrations.jellyfin;
  const px = integrations.plex;
  return {
    ...rest,
    proxyUrl: maskProxyUrl(rest.proxyUrl),
    hasPassword: ctx.accounts.hasPassword(),
    integrations: {
      jellyfin: { enabled: jf.enabled, url: jf.url, apiKey: maskSecret(jf.apiKey), lastResult: ctx.integrations.lastResult('jellyfin') },
      plex: {
        enabled: px.enabled,
        url: px.url,
        token: maskSecret(px.token),
        sectionId: px.sectionId,
        lastResult: ctx.integrations.lastResult('plex'),
      },
    },
  };
}

function fetchIpInfo(agent) {
  return new Promise((resolve, reject) => {
    const req = https.get('https://ipinfo.io/json', { agent, timeout: 10000, headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`ipinfo.io returned HTTP ${res.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('ipinfo.io returned invalid JSON'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timed out after 10s')));
    req.on('error', reject);
  });
}

async function testDramaboxToken(url, language) {
  const previous = getProxyUrl();
  try {
    await setProxy(url);
    const client = new DramaboxClient({ language, requestDelay: 1000, maxRetries: 0, cacheTTL: 60 });
    const res = await client.getToken();
    return res?.success
      ? { apiOk: true }
      : { apiOk: false, error: String(res?.message || 'Dramabox token request failed') };
  } catch (err) {
    return { apiOk: false, error: err.message };
  } finally {
    await setProxy(previous).catch(() => {});
  }
}

export function registerSystemRoutes(app, ctx) {
  app.get('/api/status', async (req) => {
    const account = ctx.auth.accountFromRequest(req);
    const profile = account ? ctx.profiles.current(req, account) : null;
    return {
      configured: getConfig().configured,
      mock: ctx.mock,
      version: pkg.version,
      lanUrls: lanUrls(ctx.port),
      upstream: ctx.provider.health(),
      authRequired: true,
      authenticated: !!account,
      account: account ? { id: account.id, username: account.username, role: account.role, mustChangePassword: account.mustChangePassword } : null,
      needsBootstrap: ctx.accounts.needsBootstrap(),
      profile,
      profileRequired: !profile,
    };
  });

  app.get('/api/setup/defaults', async () => ({
    suggestedRoot: process.env.DEFAULT_DOWNLOAD_ROOT || (process.platform === 'win32'
      ? path.join(os.homedir(), 'Videos', 'Dramabox')
      : path.join(os.homedir(), 'dramabox')),
    languages: LANGUAGES,
  }));

  app.post('/api/setup/validate-path', async (req) => {
    if (getConfig().configured) ctx.profiles.requireAdmin(req);
    return checkWritableDir(req.body?.path);
  });

  app.post('/api/setup/test-proxy', async (req) => {
    if (getConfig().configured) ctx.profiles.requireAdmin(req);
    const input = String(req.body?.proxyUrl ?? '').trim();
    if (!input) return { ok: false, error: 'Enter a proxy URL' };
    const stored = getConfig().proxyUrl;
    const useStored = !!stored && input === maskProxyUrl(stored);
    let url;
    try {
      url = useStored ? stored : parseProxyUrl(input);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    if (!url) return { ok: false, error: 'Enter a proxy URL' };

    let ip = null;
    let country = null;
    let ipError = null;
    try {
      const agent = await buildAgent(url);
      const info = await fetchIpInfo(agent);
      ip = info.ip ?? null;
      country = info.country ?? null;
    } catch (err) {
      ipError = err.message;
    }

    let apiOk = true;
    let apiError = null;
    if (!ctx.mock) {
      ({ apiOk, error: apiError } = await testDramaboxToken(url, getConfig().language));
    }

    const ok = !ipError;
    const error = ipError ? `Proxy check failed: ${ipError}` : apiError ?? undefined;
    return { ok, ip, country, apiOk, error };
  });

  app.post('/api/setup', async (req) => {
    if (getConfig().configured) throw httpError(409, 'already_configured');
    const body = req.body ?? {};

    // Password-only first registration: sets the admin password (only while none is set).
    if (body.password && !body.downloadRoot) {
      await ctx.accounts.bootstrap({ password: body.password });
      return { ok: true, needsSetup: true };
    }

    const check = await checkWritableDir(body.downloadRoot);
    if (!check.ok) throw httpError(400, check.error);

    const patch = parseSettings(body, { requireLanguage: true });
    if (body.password) await ctx.accounts.bootstrap({ password: body.password });
    saveConfig({ ...patch, downloadRoot: check.resolved, configured: true });
    await applyProxy();
    ctx.provider.setOptions(providerOptions());
    ctx.downloads.kick();
    ctx.mdns.sync();
    return { ok: true };
  });

  app.get('/api/settings', async (req) => {
    ctx.profiles.requireAdmin(req);
    return publicConfig(ctx);
  });

  app.put('/api/settings', async (req) => {
    ctx.profiles.requireAdmin(req);
    const body = req.body ?? {};
    const patch = parseSettings(body, { requireLanguage: false });
    if (body.downloadRoot !== undefined) {
      const check = await checkWritableDir(body.downloadRoot);
      if (!check.ok) throw httpError(400, check.error);
      patch.downloadRoot = check.resolved;
    }
    if (body.integrations !== undefined) {
      patch.integrations = parseIntegrations(body.integrations, getConfig().integrations);
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password === '') {
        throw httpError(400, 'Password must be 8-200 characters. Accounts always require sign-in.');
      }
      await ctx.accounts.setPassword(req.account.id, body.password, ctx.auth.tokenFromRequest(req));
    }
    saveConfig(patch);
    await applyProxy();
    ctx.provider.setOptions(providerOptions());
    ctx.downloads.kick();
    ctx.mdns.sync();
    return publicConfig(ctx);
  });
}
