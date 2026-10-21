export interface PlatformInfo {
  name: string
  color: string
  hasLogo: boolean
}

export const PLATFORMS: Record<string, PlatformInfo> = {
  starshort: { name: 'StarShort', color: '#ca8a04', hasLogo: true },
  flextv: { name: 'FlexTV', color: '#16a34a', hasLogo: true },
  dramabite: { name: 'DramaBite', color: '#db2777', hasLogo: true },
  freereels: { name: 'FreeReels', color: '#ff5a36', hasLogo: true },
  fundrama: { name: 'FunDrama', color: '#eab308', hasLogo: true },
  microdrama: { name: 'MicroDrama', color: '#06b6d4', hasLogo: true },
  vigloo: { name: 'Vigloo', color: '#9333ea', hasLogo: true },
  reelala: { name: 'Reelala', color: '#059669', hasLogo: true },
  bilitv: { name: 'BiliTV', color: '#38bdf8', hasLogo: true },
  dramabox: { name: 'DramaBox', color: '#e11d48', hasLogo: true },
  dramawave: { name: 'DramaWave', color: '#4f46e5', hasLogo: true },
  netshort: { name: 'NetShort', color: '#0284c7', hasLogo: true },
  idrama: { name: 'iDrama', color: '#3b82f6', hasLogo: true },
  shortmax: { name: 'ShortMax', color: '#7c3aed', hasLogo: true },
  goodshort: { name: 'GoodShort', color: '#0d9488', hasLogo: true },
  melolo: { name: 'Melolo', color: '#c026d3', hasLogo: true },
  velolo: { name: 'Velolo', color: '#0891b2', hasLogo: true },
  reelshort: { name: 'ReelShort', color: '#f97316', hasLogo: true },
  flickreels: { name: 'FlickReels', color: '#2563eb', hasLogo: true },
  stardusttv: { name: 'Stardusttv2', color: '#6366f1', hasLogo: true },
  serialplus: { name: 'Serial+', color: '#475569', hasLogo: true },
  dotdrama: { name: 'DotDrama', color: '#65a30d', hasLogo: true },
  rapidtv: { name: 'RapidTV', color: '#dc2626', hasLogo: true },
  shortswave: { name: 'ShortsWave', color: '#14b8a6', hasLogo: true },
  dramanova: { name: 'DramaNova', color: '#84cc16', hasLogo: true },
  cubetv: { name: 'CubeTV', color: '#a855f7', hasLogo: true },
  reelbuzz: { name: 'ReelBuzz', color: '#ea580c', hasLogo: true },
  flareflow: { name: 'FlareFlow', color: '#b45309', hasLogo: true },
  moboreels: { name: 'MoboReels', color: '#0f766e', hasLogo: true },
  happyshort: { name: 'HappyShort', color: '#ec4899', hasLogo: true },
  reelife: { name: 'Reelife', color: '#be185d', hasLogo: true },
  pinedrama: { name: 'PineDrama', color: '#22c55e', hasLogo: true },
  anyreel: { name: 'Anyreel', color: '#64748b', hasLogo: true },
  raptdrama: { name: 'RaptDrama', color: '#f43f5e', hasLogo: true },
  bonustv: { name: 'Bonustv', color: '#fb923c', hasLogo: true },
  minitv: { name: 'MiniTv', color: '#0891b2', hasLogo: true },
  golddrama: { name: 'Gold Drama', color: '#ca8a04', hasLogo: true },
  iqiyi: { name: 'IQIYI', color: '#10b981', hasLogo: true },
  bstation: { name: 'Bstation', color: '#0ea5e9', hasLogo: true },
  joyreels: { name: 'Joyreels', color: '#d946ef', hasLogo: true },
  kalostv: { name: 'KalosTV', color: '#7c3aed', hasLogo: true },
  vibeshort: { name: 'Vibeshort', color: '#a21caf', hasLogo: true },
  topdrama: { name: 'TopDrama', color: '#be123c', hasLogo: true },
  storyreel: { name: 'Storyreel', color: '#1d4ed8', hasLogo: true },
}

export function platformInfo(id: string | null | undefined, fallbackName?: string | null): PlatformInfo {
  const known = id ? PLATFORMS[id] : undefined
  if (known) return known
  return { name: fallbackName || id || '', color: '#52525b', hasLogo: false }
}
