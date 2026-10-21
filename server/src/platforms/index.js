import { dramaBox, netShort } from './legacy.js';
import {
  dramaBite,
  dramaWave,
  flickReels,
  goodShort,
  melolo,
  reelShort,
  starShort,
} from './core.js';
import {
  moboReels,
  reelBuzz,
  reelife,
  serialPlus,
  storyReel,
  vibeshort,
} from './api.js';
import {
  dotDrama,
  flareFlow,
  flexTv,
  rapidTv,
  shortMax,
  velolo,
  vigloo,
} from './generic.js';
import {
  biliTv,
  bonusTv,
  cubeTv,
  dramaNova,
  freeReels,
  funDrama,
  happyShort,
  microDrama,
  pineDrama,
  raptDrama,
  shortSwave,
  stardustTv,
} from './extra.js';

export const ADAPTERS = [
  dramaBox,
  netShort,
  reelShort,
  shortMax,
  goodShort,
  flickReels,
  dramaBite,
  dramaWave,
  starShort,
  flexTv,
  vigloo,
  melolo,
  velolo,
  dotDrama,
  rapidTv,
  reelBuzz,
  moboReels,
  reelife,
  storyReel,
  vibeshort,
  flareFlow,
  serialPlus,
  freeReels,
  funDrama,
  microDrama,
  biliTv,
  stardustTv,
  shortSwave,
  dramaNova,
  cubeTv,
  happyShort,
  pineDrama,
  raptDrama,
  bonusTv,
];

const byHost = new Map();
const byId = new Map();

for (const adapter of ADAPTERS) {
  byId.set(adapter.id, adapter);
  for (const host of adapter.hosts || [adapter.host]) {
    byHost.set(host, adapter);
  }
}

export function adapterForHost(host) {
  return byHost.get(String(host || '').toLowerCase()) || null;
}

export function adapterById(id) {
  return byId.get(String(id || '').toLowerCase()) || null;
}

export function platformLabel(source) {
  const host = source?.config?.base
    ? (() => {
        try {
          return new URL(source.config.base).hostname.toLowerCase();
        } catch {
          return '';
        }
      })()
    : '';
  return (
    adapterById(source?.config?.platform)?.label ||
    adapterForHost(host)?.label ||
    source?.name ||
    'This source'
  );
}

export function supportedPlatformNames() {
  return ADAPTERS.map((adapter) => adapter.label);
}
