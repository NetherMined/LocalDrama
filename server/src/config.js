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
  integrations: defaultIntegrations(),
};

function mergeIntegrations(stored) {
  const merged = defaultIntegrations();
  for (const key of Object.keys(merged)) Object.assign(merged[key], stored?.[key] ?? {});
  return merged;
}

let fileConfig = null;
let current = null;

function applyEnv(cfg) {
  const out = { ...cfg };
  if (process.env.DRAMABOX_PROXY) out.proxyUrl = process.env.DRAMABOX_PROXY.trim();
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
  fileConfig = { ...DEFAULT_CONFIG, ...stored, integrations: mergeIntegrations(stored.integrations) };
  current = applyEnv(fileConfig);
  return current;
}

export function getConfig() {
  return current ?? loadConfig();
}

export function saveConfig(patch) {
  if (!fileConfig) loadConfig();
  fileConfig = { ...fileConfig, ...patch };
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(fileConfig, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
  current = applyEnv(fileConfig);
  return current;
}
