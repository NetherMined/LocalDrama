import type { DailyReward, PlanPrices, RewardUnlock } from '../api'

export function showHref(bookId: string, source?: string | null): string {
  const base = `/show/${encodeURIComponent(bookId)}`
  return source ? `${base}?source=${encodeURIComponent(source)}` : base
}

export function rewardLabel(reward: DailyReward): string {
  if (reward.kind === 'points') return `${reward.value} points`
  const name = reward.name ?? 'a drama'
  if (reward.kind === 'episodes' && reward.fromEp !== undefined && reward.toEp !== undefined) {
    return `Episodes ${reward.fromEp + 1}–${reward.toEp + 1} of ${name}`
  }
  return `The whole series ${name}`
}

export function unlockLabel(unlock: RewardUnlock): string {
  if (unlock.kind === 'platform') return `${unlock.name} (VIP platform)`
  if (unlock.kind === 'episodes' && unlock.fromEp !== null && unlock.toEp !== null) {
    return `${unlock.name}: episodes ${unlock.fromEp + 1}–${unlock.toEp + 1}`
  }
  return unlock.name
}

const REASONS: Record<string, string> = {
  daily_reward: 'Daily reward',
  streak_bonus: 'Streak bonus',
  share: 'Shared a drama',
  share_join: 'A friend opened your link',
  shop_series: 'Unlocked a series',
  shop_episodes: 'Unlocked episodes',
  shop_platform: 'Unlocked a platform',
  welcome_gift: 'Welcome gift',
}

export function reasonLabel(reason: string): string {
  return REASONS[reason] ?? reason.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function priceRows(prices: PlanPrices, episodesPerUnlock: number, platformUnlockHours: number) {
  return [
    { label: 'Unlock a whole series', cost: prices.series },
    { label: 'Unlock a series on your My List', cost: prices.seriesMyList },
    { label: `Unlock the next ${episodesPerUnlock} episodes`, cost: prices.episodes },
    { label: `Unlock a VIP platform for ${platformUnlockHours} h`, cost: prices.platform },
  ]
}
