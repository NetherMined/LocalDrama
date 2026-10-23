import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import DramaboxClient from '@zhadev/dramabox';
import { getConfig, saveConfig } from '../config.js';
import { httpError } from '../errors.js';
import { buildAgent, getProxyUrl, maskProxyUrl, parseProxyUrl, setProxy } from '../proxy.js';

const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8'));
export const VERSION = pkg.version;

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
  // Inside Docker the interfaces belong to the container (for example 172.26.0.2),
  // so they are not reachable from other devices. PUBLIC_URL is the address the
  // host is actually reachable on, and is what the install QR code uses.
  const publicUrl = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (publicUrl) return [publicUrl];

  const urls = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) urls.push(`http://${info.address}:${port}`);
    }
  }
  return urls;
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
  if (body.quality !== undefined) {
    const n = Number(body.quality);
    if (!QUALITIES.has(n)) throw httpError(400, 'quality must be one of 144, 360, 540, 720, 1080');
    patch.quality = n;
  }
  const proxy = resolveIncomingProxy(body.proxyUrl);
  if (proxy !== undefined) patch.proxyUrl = proxy;
  return patch;
}

function publicConfig(ctx) {
  const { passwordHash, ...rest } = getConfig();
  return {
    ...rest,
    proxyUrl: maskProxyUrl(rest.proxyUrl),
    hasPassword: ctx.accounts.hasPassword(),
  };
}

// Egress lookups are informational; several services because each one blocks some proxy IPs.
const EGRESS_SERVICES = [
  { url: 'https://ipinfo.io/json', pick: (j) => ({ ip: j.ip, country: j.country }) },
  { url: 'https://ipapi.co/json/', pick: (j) => ({ ip: j.ip, country: j.country_code || j.country }) },
  { url: 'https://ifconfig.co/json', pick: (j) => ({ ip: j.ip, country: j.country_iso }) },
];

function getJson(url, agent) {
  const host = new URL(url).hostname;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      agent,
      timeout: 10000,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`${host} returned HTTP ${res.statusCode}`));
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`${host} returned invalid JSON`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${host} timed out after 10s`)));
    req.on('error', reject);
  });
}

async function fetchEgress(agent) {
  const errors = [];
  for (const service of EGRESS_SERVICES) {
    try {
      const info = service.pick(await getJson(service.url, agent));
      if (info.ip) return info;
      errors.push(`${new URL(service.url).hostname} returned no IP`);
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(errors.join('; '));
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
      publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
      upstream: ctx.provider.health(),
      authRequired: true,
      authenticated: !!account,
      guestBrowsing: true,
      account: account ? { id: account.id, username: account.username, role: account.role, mustChangePassword: account.mustChangePassword } : null,
      needsBootstrap: ctx.accounts.needsBootstrap(),
      defaultCredentials: ctx.accounts.defaultCredentialsActive(),
      profile,
      profileRequired: !profile,
      ...(account?.role === 'admin' ? { pendingRequests: ctx.accounts.pendingCount() } : {}),
    };
  });

  app.get('/api/setup/defaults', async () => ({
    languages: LANGUAGES,
  }));

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
      const info = await fetchEgress(agent);
      ip = info.ip ?? null;
      country = info.country ?? null;
    } catch (err) {
      ipError = err.message;
    }

    let apiOk = true;
    let apiError = null;
    if (!ctx.mock) {
      ({ apiOk, error: apiError } = await testDramaboxToken(url, getConfig().language));
      if (apiError && /403|Access Denied/i.test(apiError)) {
        apiError = 'Dramabox refused the connection (HTTP 403 Access Denied). This proxy IP is blocked; datacenter IPs often are, so try a residential proxy.';
      }
    }

    // A working Dramabox connection proves the proxy works even if no IP lookup service answered.
    const ok = !ipError || apiOk;
    const notes = [apiError, ipError && `Could not look up the proxy's IP (${ipError})`].filter(Boolean);
    return { ok, ip, country, apiOk, error: notes.length ? notes.join(' · ') : undefined };
  });

  app.post('/api/setup', async (req) => {
    if (getConfig().configured) throw httpError(409, 'already_configured');
    const body = req.body ?? {};

    // Password-only first registration: sets the admin password (only while none is set).
    if (body.password && body.language === undefined) {
      await ctx.accounts.bootstrap({ password: body.password });
      return { ok: true, needsSetup: true };
    }

    const patch = parseSettings(body, { requireLanguage: true });
    if (body.password) await ctx.accounts.bootstrap({ password: body.password });
    saveConfig({ ...patch, configured: true });
    await applyProxy();
    ctx.provider.setOptions(providerOptions());
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
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password === '') {
        throw httpError(400, 'Password must be 8-200 characters. Accounts always require sign-in.');
      }
      await ctx.accounts.setPassword(req.account.id, body.password, ctx.auth.tokenFromRequest(req));
    }
    saveConfig(patch);
    await applyProxy();
    ctx.provider.setOptions(providerOptions());
    return publicConfig(ctx);
  });
}
