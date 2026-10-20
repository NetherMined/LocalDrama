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

const GOODBOS_PLATFORMS = [
  { id: 'dramabox', name: 'DramaBox', base: 'https://dramabox.goodbos.online' },
  { id: 'reelshort', name: 'ReelShort', base: 'https://reelshort.goodbos.online' },
  { id: 'shortmax', name: 'ShortMax', base: 'https://shortmax.goodbos.online' },
  { id: 'goodshort', name: 'GoodShort', base: 'https://goodshort.goodbos.online' },
  { id: 'flickreels', name: 'FlickReels', base: 'https://flickreels.goodbos.online' },
  { id: 'dramabite', name: 'DramaBite', base: 'https://dramabite.goodbos.online' },
  { id: 'netshort', name: 'NetShort', base: 'https://netshort.goodbos.online' },
  { id: 'dramawave', name: 'DramaWave', base: 'https://dramawave.goodbos.online' },
  { id: 'starshort', name: 'StarShort', base: 'https://drakula.goodbos.online' },
  { id: 'flextv', name: 'FlexTV', base: 'https://flextv.goodbos.online' },
  { id: 'vigloo', name: 'Vigloo', base: 'https://vigloo.goodbos.online' },
  { id: 'melolo', name: 'Melolo', base: 'https://melolo.goodbos.online' },
  { id: 'velolo', name: 'Velolo', base: 'https://velolo.goodbos.online' },
  { id: 'dotdrama', name: 'DotDrama', base: 'https://dotdrama.goodbos.online' },
  { id: 'rapidtv', name: 'RapidTV', base: 'https://rapidtv.goodbos.online' },
  { id: 'reelbuzz', name: 'ReelBuzz', base: 'https://reelbuzz.goodbos.online' },
  { id: 'moboreels', name: 'MoboReels', base: 'https://moboreels.goodbos.online' },
  { id: 'reelife', name: 'Reelife', base: 'https://reelife.goodbos.online' },
  { id: 'storyreel', name: 'Storyreel', base: 'https://storyreel.goodbos.online' },
  { id: 'flareflow', name: 'FlareFlow', base: 'https://plerplow.goodbos.online' },
  { id: 'vibeshort', name: 'Vibeshort', base: 'https://vibeshort.goodbos.online' },
  { id: 'serialplus', name: 'Serial+', base: 'https://serealplus.goodbos.online' },
];

export function defaultSources() {
  const shared = { apiKey: '' };
  return [
    {
      id: 'dramabuzz',
      type: 'dramabuzz',
      name: 'DramaBuzz / GoodBos (shared key)',
      enabled: true,
      config: shared,
      lastHealth: null,
    },
    ...GOODBOS_PLATFORMS.map((p) => ({
      id: p.id,
      type: 'goodbos',
      name: p.name,
      enabled: p.id === 'dramabox',
      config: { ...shared, base: p.base, platform: p.id },
      lastHealth: null,
    })),
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
  activeSourceId: 'dramabox',
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
