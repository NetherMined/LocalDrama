import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(REPO_ROOT, 'data'));
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export function defaultIntegrations() {
  return {
    jellyfin: { enabled: false, url: '', apiKey: '' },
    plex: { enabled: false, url: '', token: '', sectionId: '' },
  };
}

export function defaultSources() {
  return [
    {
      id: 'dramabuzz',
      type: 'dramabuzz',
      name: 'DramaBuzz / GoodBos (shared key)',
      enabled: true,
      config: { apiKey: '' },
      lastHealth: null,
    },
    {
      id: 'flareflow',
      type: 'goodbos',
      name: 'FlareFlow',
      enabled: true,
      config: { apiKey: '', base: 'https://plerplow.goodbos.online', platform: 'flareflow' },
      lastHealth: null,
    },
    {
      id: 'reelshort',
      type: 'goodbos',
      name: 'ReelShort',
      enabled: true,
      config: { apiKey: '', base: 'https://reelshort.goodbos.online', platform: 'reelshort' },
      lastHealth: null,
    },
    {
      id: 'vibeshort',
      type: 'goodbos',
      name: 'Vibeshort',
      enabled: true,
      config: { apiKey: '', base: 'https://vibeshort.goodbos.online', platform: 'vibeshort' },
      lastHealth: null,
    },
    {
      id: 'serialplus',
      type: 'goodbos',
      name: 'Serial+',
      enabled: true,
      config: { apiKey: '', base: 'https://serealplus.goodbos.online', platform: 'serialplus' },
      lastHealth: null,
    },
    {
      id: 'dramabos',
      type: 'dramabos',
      name: 'DramaBos',
      enabled: true,
      config: { apiKey: '' },
      lastHealth: null,
    },
    {
      id: 'dramabox',
      type: 'dramabox',
      name: 'Dramabox (official — proxy removed)',
      enabled: false,
      config: { proxyUrl: '' },
      lastHealth: null,
    },
  ];
}

export const DEFAULT_CONFIG = {
  downloadRoot: '',
  language: 'en',
  requestDelay: 2000,
  concurrency: 1,
  quality: 720,
  proxyUrl: '',
  passwordHash: '',
  configured: false,
  mdns: true,
  activeSourceId: 'dramabuzz',
  sources: defaultSources(),
  integrations: defaultIntegrations(),
};

function mergeIntegrations(stored) {
  const merged = defaultIntegrations();
  for (const key of Object.keys(merged)) Object.assign(merged[key], stored?.[key] ?? {});
  return merged;
}

function mergeSources(stored) {
  const defaults = defaultSources();
  if (!Array.isArray(stored)) return defaults;
  const byId = new Map(stored.map((s) => [s.id, s]));
  return defaults.map((def) => {
    const existing = byId.get(def.id);
    if (!existing) return def;
    return {
      ...def,
      ...existing,
      config: { ...def.config, ...(existing.config || {}) },
    };
  });
}

let fileConfig = null;
let current = null;

function applyEnv(cfg) {
  const out = { ...cfg };
  if (process.env.REQUEST_DELAY) out.requestDelay = Number(process.env.REQUEST_DELAY);
  if (process.env.DRAMABOX_LANG) out.language = process.env.DRAMABOX_LANG.trim();
  return out;
}

export function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    stored = {};
  }
  fileConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    integrations: mergeIntegrations(stored.integrations),
    sources: mergeSources(stored.sources),
  };
  current = applyEnv(fileConfig);
  return current;
}

export function getConfig() {
  return current ?? loadConfig();
}

export function saveConfig(patch) {
  if (!fileConfig) loadConfig();
  fileConfig = { ...fileConfig, ...patch };
  if (patch.sources) fileConfig.sources = mergeSources(patch.sources);
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(fileConfig, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
  current = applyEnv(fileConfig);
  return current;
}
