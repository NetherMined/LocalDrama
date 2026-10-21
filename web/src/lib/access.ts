import type { AccountSummary } from '../api'

export function isVipAccount(account: Pick<AccountSummary, 'role' | 'tier' | 'vipUntil'> | null | undefined): boolean {
  if (!account) return false
  if (account.role === 'admin') return true
  if (account.tier !== 'vip') return false
  return !account.vipUntil || Date.parse(account.vipUntil) > Date.now()
}

export function vipExpired(account: Pick<AccountSummary, 'role' | 'tier' | 'vipUntil'>): boolean {
  return account.tier === 'vip' && !!account.vipUntil && Date.parse(account.vipUntil) <= Date.now()
}
