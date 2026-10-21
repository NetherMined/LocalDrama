export interface PlatformInfo {
  name: string
  color: string
  hasLogo: boolean
}

export const PLATFORMS: Record<string, PlatformInfo> = {
  dramabox: { name: 'DramaBox', color: '#e11d48', hasLogo: true },
  reelshort: { name: 'ReelShort', color: '#f97316', hasLogo: true },
  shortmax: { name: 'ShortMax', color: '#7c3aed', hasLogo: false },
  goodshort: { name: 'GoodShort', color: '#0d9488', hasLogo: true },
  flickreels: { name: 'FlickReels', color: '#2563eb', hasLogo: true },
  dramabite: { name: 'DramaBite', color: '#db2777', hasLogo: false },
  netshort: { name: 'NetShort', color: '#0284c7', hasLogo: false },
  dramawave: { name: 'DramaWave', color: '#4f46e5', hasLogo: true },
  starshort: { name: 'StarShort', color: '#ca8a04', hasLogo: true },
  flextv: { name: 'FlexTV', color: '#16a34a', hasLogo: false },
  vigloo: { name: 'Vigloo', color: '#9333ea', hasLogo: false },
  melolo: { name: 'Melolo', color: '#c026d3', hasLogo: false },
  velolo: { name: 'Velolo', color: '#0891b2', hasLogo: false },
  dotdrama: { name: 'DotDrama', color: '#65a30d', hasLogo: false },
  rapidtv: { name: 'RapidTV', color: '#dc2626', hasLogo: false },
  reelbuzz: { name: 'ReelBuzz', color: '#ea580c', hasLogo: false },
  moboreels: { name: 'MoboReels', color: '#0f766e', hasLogo: false },
  reelife: { name: 'Reelife', color: '#be185d', hasLogo: false },
  storyreel: { name: 'Storyreel', color: '#1d4ed8', hasLogo: false },
  flareflow: { name: 'FlareFlow', color: '#b45309', hasLogo: true },
  vibeshort: { name: 'Vibeshort', color: '#a21caf', hasLogo: true },
  serialplus: { name: 'Serial+', color: '#475569', hasLogo: false },
}

export function platformInfo(id: string | null | undefined, fallbackName?: string | null): PlatformInfo {
  const known = id ? PLATFORMS[id] : undefined
  if (known) return known
  return { name: fallbackName || id || '', color: '#52525b', hasLogo: false }
}
