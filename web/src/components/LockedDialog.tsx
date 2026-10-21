import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type LockedEpisode, type PlanPrices, type RewardsSummary, type ShopInput, type ShopResult, type UnlockOption } from '../api'
import { errorMessage } from '../lib/format'
import { LockIcon } from './icons'
import { Modal } from './Modal'
import { NoticeText, buttonClass } from './ui'

interface LockedDialogProps {
  bookId: string
  source: string | null
  platformName: string
  episodeNumber: number
  locked: LockedEpisode
  onUnlocked: (result: ShopResult, option: UnlockOption) => void
  onClose: () => void
}

function reasonText(locked: LockedEpisode, platformName: string): string {
  if (locked.reason === 'platform') return `${platformName} is a VIP platform.`
  return `One of the most popular series on ${platformName}.`
}

function optionTitle(option: UnlockOption, platformName: string, episodesPerUnlock: number | null): string {
  if (option.kind === 'episodes') {
    const from = (option.fromEp ?? 0) + 1
    const to = option.toEp !== undefined ? option.toEp + 1 : from + (episodesPerUnlock ?? 5) - 1
    return `Unlock episodes ${from}–${to}`
  }
  if (option.kind === 'platform') return `Unlock ${platformName} for ${option.hours ?? 24} h`
  return 'Unlock the whole series'
}

function shopInput(option: UnlockOption, bookId: string, source: string | null, fallbackPlatform: string | null): ShopInput {
  if (option.kind === 'platform') return { kind: 'platform', source: option.ref ?? fallbackPlatform ?? undefined }
  if (option.kind === 'episodes') return { kind: 'episodes', bookId, source: source ?? undefined, fromEp: option.fromEp }
  return { kind: 'series', bookId, source: source ?? undefined }
}

function purchaseError(err: unknown): string {
  if (err instanceof ApiError && err.message === 'not_enough_points') return 'Not enough points for this one.'
  return errorMessage(err)
}

export function LockedDialog({ bookId, source, platformName, episodeNumber, locked, onUnlocked, onClose }: LockedDialogProps) {
  const [rewards, setRewards] = useState<RewardsSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getRewards()
      .then((res) => {
        if (!cancelled) setRewards(res)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const balance = rewards?.balance ?? null
  const prices: PlanPrices | null = rewards?.rules.prices ?? null
  const episodesPerUnlock = rewards?.rules.episodesPerUnlock ?? null
  const myListPrice = prices && prices.seriesMyList < prices.series ? prices.seriesMyList : null

  async function purchase(option: UnlockOption, index: number) {
    setBusy(index)
    setError(null)
    try {
      const result = await api.shopPurchase(shopInput(option, bookId, source, locked.source))
      onUnlocked(result, option)
    } catch (err) {
      setError(purchaseError(err))
      setBusy(null)
    }
  }

  return (
    <Modal
      title={`Episode ${episodeNumber} is locked`}
      description={reasonText(locked, platformName)}
      onClose={onClose}
    >
      <div className="space-y-5">
        {balance !== null && (
          <p className="text-sm text-muted">
            You have <span className="font-semibold text-white tabular-nums">{balance} points</span>
          </p>
        )}
        {loadError && <NoticeText notice={{ kind: 'err', text: loadError }} />}

        {locked.options.length > 0 ? (
          <ul className="space-y-2">
            {locked.options.map((option, index) => {
              const cost = option.cost
              const missing = balance !== null && balance < cost ? cost - balance : 0
              const isSeriesMyList = option.kind === 'series' && myListPrice !== null && cost === myListPrice
              return (
                <li key={`${option.kind}-${option.fromEp ?? ''}-${index}`}>
                  <button
                    type="button"
                    data-autofocus={index === 0 || undefined}
                    disabled={balance === null || missing > 0 || busy !== null}
                    onClick={() => void purchase(option, index)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-4 py-3 text-left transition hover:border-accent-hi disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{optionTitle(option, platformName, episodesPerUnlock)}</span>
                      {isSeriesMyList && <span className="block text-xs text-muted">My List price</span>}
                      {missing > 0 && <span className="block text-xs text-muted">{missing} more points</span>}
                    </span>
                    <span className="shrink-0 text-sm font-bold whitespace-nowrap tabular-nums">
                      {busy === index ? 'Unlocking...' : `${cost} pts`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">
            No unlock options are available for this episode right now.
          </p>
        )}

        {error && <NoticeText notice={{ kind: 'err', text: error }} />}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
          <Link to="/rewards" onClick={onClose} className="font-semibold text-accent-text hover:text-white">
            Earn points
          </Link>
          <button type="button" onClick={onClose} className={buttonClass('ghost')}>
            Close
          </button>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted">
          <LockIcon className="h-3.5 w-3.5 shrink-0" />
          Want everything? Ask your admin for VIP.
        </p>
      </div>
    </Modal>
  )
}
