import { httpError } from './errors.js';

const TIMEOUT_MS = 10000;
const DEBOUNCE_MS = 30000;
const TYPES = ['jellyfin', 'plex'];

export const MASK = '***';

export function parseType(value) {
  if (!TYPES.includes(value)) throw httpError(400, 'type must be jellyfin or plex');
  return value;
}

export function normalizeUrl(input) {
  const value = String(input ?? '').trim();
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError(400, 'Enter a full URL such as http://192.168.1.10:8096');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw httpError(400, 'URL must start with http:// or https://');
  }
  return value.replace(/\/+$/, '');
}

// A masked or missing secret keeps the stored value; an empty string clears it.
export function resolveSecret(input, stored) {
  if (input === undefined || input === null || input === MASK) return stored;
  return String(input).trim();
}

export function maskSecret(value) {
  return value ? MASK : '';
}

function errorMessage(err) {
  const cause = err?.cause?.message || err?.cause?.code;
  return cause ? `${err.message}: ${cause}` : String(err?.message || err);
}

async function request(url, { method = 'GET', headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).pathname}`);
  return res;
}

async function getJson(url, headers) {
  return (await request(url, { headers })).json();
}

export function createIntegrations({ getConfig, log }) {
  const results = { jellyfin: null, plex: null };
  const timers = { jellyfin: null, plex: null };

  async function plexSections(cfg) {
    const data = await getJson(`${cfg.url}/library/sections`, { 'X-Plex-Token': cfg.token });
    return (data.MediaContainer?.Directory ?? []).map((d) => ({ id: String(d.key), title: d.title }));
  }

  async function refreshOnce(type) {
    const cfg = getConfig().integrations[type];
    if (!cfg.url) throw new Error('Server URL is not set');
    if (type === 'jellyfin') {
      await request(`${cfg.url}/Library/Refresh`, { method: 'POST', headers: { 'X-Emby-Token': cfg.apiKey } });
      return;
    }
    const ids = cfg.sectionId ? [cfg.sectionId] : (await plexSections(cfg)).map((s) => s.id);
    for (const id of ids) {
      await request(`${cfg.url}/library/sections/${encodeURIComponent(id)}/refresh`, { headers: { 'X-Plex-Token': cfg.token } });
    }
  }

  async function refreshNow(type) {
    let result;
    try {
      await refreshOnce(type);
      result = { ok: true, at: new Date().toISOString() };
    } catch (err) {
      result = { ok: false, at: new Date().toISOString(), error: errorMessage(err) };
      log.warn(`${type} library refresh failed: ${result.error}`);
    }
    results[type] = result;
    return result;
  }

  return {
    lastResult(type) {
      return results[type];
    },

    notifyDownloadComplete() {
      const { integrations } = getConfig();
      for (const type of TYPES) {
        if (!integrations[type].enabled || !integrations[type].url) continue;
        clearTimeout(timers[type]);
        timers[type] = setTimeout(() => {
          timers[type] = null;
          refreshNow(type).catch(() => {});
        }, DEBOUNCE_MS);
      }
    },

    refreshNow(type) {
      return refreshNow(type);
    },

    async test(type, input = {}) {
      const stored = getConfig().integrations[type];
      const url = normalizeUrl(input.url ?? stored.url);
      if (!url) return { ok: false, error: 'Enter a server URL' };
      try {
        if (type === 'jellyfin') {
          const apiKey = resolveSecret(input.apiKey, stored.apiKey);
          const info = await getJson(`${url}/System/Info`, { 'X-Emby-Token': apiKey });
          return { ok: true, name: info.ServerName ?? null, version: info.Version ?? null };
        }
        const token = resolveSecret(input.token ?? input.apiKey, stored.token);
        const identity = await getJson(`${url}/identity`, { 'X-Plex-Token': token });
        const sections = await plexSections({ url, token });
        return { ok: true, version: identity.MediaContainer?.version ?? null, sections };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  };
}
