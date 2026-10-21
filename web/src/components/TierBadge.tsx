import type { AccountTier } from '../api'
import { fmtDate } from '../lib/format'
import { vipExpired } from '../lib/access'
import { LockIcon } from './icons'

export function TierBadge({
  tier,
  vipUntil,
  role,
}: {
  tier: AccountTier
  vipUntil: string | null
  role?: 'admin' | 'user'
}) {
  const expired = vipExpired({ role: role ?? 'user', tier, vipUntil })
  if (tier === 'vip' && !expired) {
    const label = vipUntil ? `VIP until ${fmtDate(vipUntil)}` : 'VIP'
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent-hi/50 bg-accent-hi/10 px-2 py-0.5 text-[11px] font-bold tracking-wider text-accent-text uppercase">
        <span className="whitespace-nowrap">{label}</span>
      </span>
    )
  }
  if (expired) {
    return (
      <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold tracking-wider text-amber-300 uppercase">
        VIP expired
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-bold tracking-wider text-muted uppercase">
      Free
    </span>
  )
}

export function VipLockBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-accent-text uppercase backdrop-blur-sm ${className}`}
    >
      <LockIcon className="h-3 w-3" />
      VIP
    </span>
  )
}
