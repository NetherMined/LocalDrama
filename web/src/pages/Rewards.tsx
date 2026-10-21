import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type DailyResult, type RewardsSummary } from '../api'
import { LockIcon } from '../components/icons'
import { EmptyState, ErrorPanel, NoticeText, PageHeader, Section, Spinner, buttonClass } from '../components/ui'
import { isVipAccount } from '../lib/access'
import { errorMessage, fmtAgo, fmtDate } from '../lib/format'
import { priceRows, reasonLabel, rewardLabel, showHref, unlockLabel } from '../lib/rewards'
import { useStatus } from '../status'

export function Rewards() {
  const { status } = useStatus()
  const [data, setData] = useState<RewardsSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [claiming, setClaiming] = useState(false)
  const [won, setWon] = useState<DailyResult | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const vip = isVipAccount(status?.account) || !!data?.vip

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    api
      .getRewards()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function refresh() {
    try {
      setData(await api.getRewards())
    } catch {
      // Keep what is on screen.
    }
  }

  async function claim() {
    setClaiming(true)
    setClaimError(null)
    try {
      const res = await api.claimDaily()
      setWon(res)
      await refresh()
    } catch (err) {
      if (err instanceof ApiError && err.message === 'already_claimed') await refresh()
      else setClaimError(errorMessage(err))
    } finally {
      setClaiming(false)
    }
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Rewards" />
        <ErrorPanel title="Rewards could not load" message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
      </>
    )
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Rewards" />
        <Spinner label="Loading rewards" />
      </>
    )
  }

  if (vip) {
    return (
      <>
        <PageHeader title="Rewards" />
        <div className="space-y-6">
          <div className="flex items-center gap-4 rounded-xl border border-accent-hi/40 bg-accent-hi/10 p-5 sm:p-6">
            <LockIcon className="h-8 w-8 shrink-0 text-accent-text" />
            <div>
              <p className="text-lg font-bold">You're VIP: everything is unlocked</p>
              <p className="mt-1 text-sm text-muted">Every drama and episode plays without points.</p>
            </div>
          </div>
          <History data={data} />
        </div>
      </>
    )
  }

  const days = data.rules.streakDays
  const streak = data.streak
  const todayReward = won?.reward ?? (data.daily.claimed ? data.daily.reward : null)
  const sharesLeft = Math.max(0, data.shares.max - data.shares.today)

  return (
    <>
      <PageHeader title="Rewards">
        <Link to="/browse" className={buttonClass('ghost')}>
          Find a drama
        </Link>
      </PageHeader>

      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-line bg-panel p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">Balance</p>
            <p className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">
              {data.balance}
              <span className="ml-2 text-base font-semibold text-muted">points</span>
            </p>
          </div>
          <p className="max-w-xs text-sm text-muted">Spend points to unlock locked dramas and episodes from the drama's page.</p>
        </div>

        <Section id="daily" title="Daily reward" description="Claim once a day for points, episodes or a whole series.">
          {won && (
            <div role="status" className="mb-4 rounded-lg border border-accent-hi/40 bg-accent-hi/10 p-4 text-sm">
              <p className="font-semibold">You won {rewardLabel(won.reward)}!</p>
              {won.bonus > 0 && <p className="mt-1 text-muted">Streak bonus: +{won.bonus} points.</p>}
            </div>
          )}
          {!data.daily.claimed && !won ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-muted">Today's reward is ready.</p>
              <button type="button" onClick={() => void claim()} disabled={claiming} className={buttonClass()}>
                {claiming ? 'Claiming...' : 'Claim today’s reward'}
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-muted">
                {todayReward ? (
                  <>Today you got {rewardLabel(todayReward)}.</>
                ) : (
                  <>Today's reward is claimed. Come back tomorrow.</>
                )}
              </p>
              {todayReward?.bookId && (
                <Link to={showHref(todayReward.bookId, todayReward.source)} className="font-semibold text-accent-text hover:text-white">
                  Open {todayReward.name ?? 'the drama'}
                </Link>
              )}
            </div>
          )}
          {claimError && (
            <div className="mt-4">
              <NoticeText notice={{ kind: 'err', text: claimError }} />
            </div>
          )}

          <div className="mt-6 space-y-2">
            <p className="text-sm font-semibold">
              Streak: {streak} {streak === 1 ? 'day' : 'days'}
            </p>
            {days > 0 && (
              <div className="flex flex-wrap items-center gap-2" role="img" aria-label={`${Math.min(streak, days)} of ${days} days`}>
                {Array.from({ length: days }, (_, i) => (
                  <span key={i} className={`h-3 w-3 rounded-full ${i < streak ? 'bg-accent-hi' : 'bg-line'}`} />
                ))}
                <span className="ml-2 text-xs text-muted">
                  Day {days} earns +{data.rules.streakBonus} points
                </span>
              </div>
            )}
          </div>
        </Section>

        <Section id="share" title="Share to earn" description="Share a drama from its page with the Share button.">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {data.shares.today}/{data.shares.max}
                <span className="ml-2 text-sm font-semibold text-muted">shared today</span>
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                <li>+{data.rules.sharePoints} points for each share, up to {data.shares.max} a day</li>
                <li>+{data.rules.shareJoinBonus} more when a friend opens your link and signs in</li>
              </ul>
            </div>
            <Link to="/browse" className={buttonClass('ghost')}>
              {sharesLeft > 0 ? 'Pick a drama to share' : 'Browse dramas'}
            </Link>
          </div>
        </Section>

        <Section id="unlocks" title="Active unlocks" description="Dramas and episodes you can watch because of points or gifts.">
          {data.unlocks.length === 0 ? (
            <EmptyState title="Nothing unlocked right now" />
          ) : (
            <ul className="divide-y divide-line">
              {data.unlocks.map((unlock, i) => (
                <li key={`${unlock.kind}-${unlock.ref}-${unlock.fromEp ?? ''}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="min-w-0">
                    {unlock.kind === 'platform' ? (
                      <span className="font-semibold">{unlockLabel(unlock)}</span>
                    ) : (
                      <Link to={showHref(unlock.ref)} className="font-semibold hover:text-accent-text">
                        {unlockLabel(unlock)}
                      </Link>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {unlock.expiresAt ? `Until ${fmtDate(unlock.expiresAt)}` : 'Never expires'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <History data={data} />

        <Section id="prices" title="Prices" description="What points buy.">
          <ul className="divide-y divide-line text-sm">
            {priceRows(data.rules.prices, data.rules.episodesPerUnlock, data.rules.platformUnlockHours).map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                <span>{row.label}</span>
                <span className="font-bold tabular-nums">{row.cost} pts</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  )
}

function History({ data }: { data: RewardsSummary }) {
  return (
    <Section id="history" title="Recent activity" description="Points in and out.">
      {data.history.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <ul className="divide-y divide-line">
          {data.history.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{reasonLabel(item.reason)}</span>
                <span className="block text-xs text-muted">{fmtAgo(item.createdAt)}</span>
              </span>
              <span className={`shrink-0 font-bold tabular-nums ${item.delta >= 0 ? 'text-emerald-300' : 'text-white/70'}`}>
                {item.delta >= 0 ? '+' : ''}
                {item.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
