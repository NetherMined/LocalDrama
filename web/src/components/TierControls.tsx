import { useId, useState } from 'react'
import { api, type AccountTier, type AdminAccount } from '../api'
import { errorMessage } from '../lib/format'
import { TierBadge } from './TierBadge'
import type { Notify } from './UserActions'

interface TierControlsProps {
  user: AdminAccount
  onChanged: () => void
  onNotify: Notify
}

function localDay(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The expiry is the last moment of the chosen local day.
function endOfDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}

const dateInputClass =
  'rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent-hi disabled:opacity-40'

export function TierControls({ user, onChanged, onNotify }: TierControlsProps) {
  const uid = useId()
  const [busy, setBusy] = useState(false)
  const [day, setDay] = useState(() => (user.vipUntil ? localDay(user.vipUntil) : ''))
  const isVip = user.tier === 'vip'

  async function patch(body: { tier?: AccountTier; vipUntil?: string | null }, success: string) {
    setBusy(true)
    try {
      await api.updateAdminUser(user.id, body)
      onNotify(success, 'ok')
      onChanged()
    } catch (err) {
      onNotify(errorMessage(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`${uid}-access`} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${uid}-access`} className="text-base font-bold">
          Access
        </h3>
        <TierBadge tier={user.tier} vipUntil={user.vipUntil} role={user.role} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {user.role === 'admin'
          ? 'Admins always have full access, whatever the tier below says.'
          : 'VIP accounts watch everything without points. Free accounts follow the Free plan in Settings.'}
      </p>

      <div role="group" aria-label="Account tier" className="mt-4 grid max-w-xs grid-cols-2 gap-2">
        {(['free', 'vip'] as const).map((tier) => {
          const selected = user.tier === tier
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={selected}
              disabled={busy || selected}
              onClick={() => void patch({ tier }, `${user.username} is now ${tier === 'vip' ? 'VIP' : 'free'}`)}
              className={`min-h-11 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-default ${
                selected ? 'border-accent bg-accent text-white' : 'border-white/10 text-white/80 hover:border-white/30 hover:text-white'
              }`}
            >
              {tier === 'vip' ? 'VIP' : 'Free'}
            </button>
          )
        })}
      </div>

      <div className="mt-5 space-y-2">
        <label htmlFor={`${uid}-expiry`} className="text-sm font-semibold">
          VIP until
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`${uid}-expiry`}
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            disabled={!isVip || busy}
            className={dateInputClass}
          />
          <button
            type="button"
            disabled={!isVip || !day || busy}
            onClick={() => void patch({ vipUntil: endOfDay(day) }, `VIP expires on ${day}`)}
            className="min-h-11 rounded-md border border-white/10 px-4 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Save date
          </button>
          <button
            type="button"
            disabled={!isVip || !user.vipUntil || busy}
            onClick={() => {
              setDay('')
              void patch({ vipUntil: null }, 'VIP never expires')
            }}
            className="min-h-11 rounded-md border border-white/10 px-4 text-sm font-semibold text-white/90 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Never expires
          </button>
        </div>
        <p className="text-xs text-muted">
          {!isVip
            ? 'Switch to VIP to set an expiry.'
            : user.vipUntil
              ? 'VIP ends at the end of the chosen day, in this browser’s time zone.'
              : 'No expiry: VIP stays on until changed.'}
        </p>
      </div>
    </section>
  )
}
