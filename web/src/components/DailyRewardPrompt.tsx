import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type DailyResult } from '../api'
import { isVipAccount } from '../lib/access'
import { errorMessage } from '../lib/format'
import { rewardLabel } from '../lib/rewards'
import { useStatus } from '../status'
import { Modal } from './Modal'
import { NoticeText, buttonClass } from './ui'

// Shown at most once per page session for each account.
let promptedAccount: number | null = null

export function DailyRewardPrompt() {
  const { status } = useStatus()
  const account = status?.account ?? null
  const accountId = account?.id ?? null
  const vip = isVipAccount(account)
  const [open, setOpen] = useState(false)
  const [won, setWon] = useState<DailyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (accountId === null || vip || promptedAccount === accountId) return
    let cancelled = false
    api
      .getRewards()
      .then((res) => {
        if (cancelled || res.daily.claimed || promptedAccount === accountId) return
        promptedAccount = accountId
        setOpen(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [accountId, vip])

  if (!open) return null

  async function claim() {
    setBusy(true)
    setError(null)
    try {
      setWon(await api.claimDaily())
    } catch (err) {
      setError(errorMessage(err) === 'already_claimed' ? 'You already claimed today’s reward.' : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={won ? 'Reward claimed' : 'Your daily reward is ready'}
      description={won ? undefined : 'Claim it now, or later from Rewards.'}
      onClose={() => setOpen(false)}
    >
      {won ? (
        <div className="space-y-4">
          <p className="text-sm">
            You won <span className="font-semibold">{rewardLabel(won.reward)}</span>.
          </p>
          {won.bonus > 0 && <p className="text-sm text-muted">Streak bonus: +{won.bonus} points.</p>}
          <div className="flex justify-end gap-2">
            <Link to="/rewards" onClick={() => setOpen(false)} className={buttonClass('ghost')}>
              See rewards
            </Link>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass()}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <NoticeText notice={{ kind: 'err', text: error }} />}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost')}>
              Later
            </button>
            <button type="button" onClick={() => void claim()} disabled={busy} data-autofocus className={buttonClass()}>
              {busy ? 'Claiming...' : 'Claim'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
