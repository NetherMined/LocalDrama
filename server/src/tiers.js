// Simple tier helpers for free vs VIP source gating.

const PREMIUM_SOURCES = new Set([
  'dramabox', 'reelshort', 'shortmax', 'goodshort', 'flickreels',
  'dramabite', 'netshort', 'dramawave', 'starshort', 'flextv',
  'vigloo', 'melolo', 'velolo', 'dotdrama', 'rapidtv', 'reelbuzz',
  'moboreels', 'reelife', 'storyreel', 'flareflow', 'vibeshort', 'serialplus',
]);

export function isPremiumSource(sourceId) {
  return PREMIUM_SOURCES.has(String(sourceId || '').toLowerCase());
}

export function canAccessSource(account, sourceId) {
  if (!account) return false;
  if (account.tier === 'vip' || account.role === 'admin') return true;
  return !isPremiumSource(sourceId);
}

export function sourceGateMessage() {
  return 'This source is available on VIP. Share or return to unlock episodes on the free tier, or upgrade for full access.';
}
