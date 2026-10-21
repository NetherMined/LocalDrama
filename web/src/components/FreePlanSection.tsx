import { useState, type FormEvent } from 'react'
import { api, type Config, type DailyWeight, type Plan, type PlanPatch, type PlanPrices, type SettingsSource } from '../api'
import { errorMessage } from '../lib/format'
import { NoticeText, Section, buttonClass, inputClass, type Notice } from './ui'

interface PlanForm {
  vipPlatforms: string[]
  popularSharePct: number
  popularMinPlays: number
  welcomeGiftEveryDays: number
  dailyRewards: DailyWeight[]
  streakDays: number
  streakBonus: number
  sharePoints: number
  shareMaxPerDay: number
  shareJoinBonus: number
  episodesPerUnlock: number
  platformUnlockHours: number
  prices: PlanPrices
}

const DAILY_LABELS: Record<DailyWeight['kind'], string> = {
  points: 'Points',
  episodes: 'Next episodes',
  series: 'Whole series',
}

function toForm(plan: Plan): PlanForm {
  return {
    vipPlatforms: [...plan.vipPlatforms],
    popularSharePct: Math.round(plan.popularShare * 100),
    popularMinPlays: plan.popularMinPlays,
    welcomeGiftEveryDays: plan.welcomeGiftEveryDays,
    dailyRewards: plan.dailyRewards.map((r) => ({ ...r })),
    streakDays: plan.streakDays,
    streakBonus: plan.streakBonus,
    sharePoints: plan.sharePoints,
    shareMaxPerDay: plan.shareMaxPerDay,
    shareJoinBonus: plan.shareJoinBonus,
    episodesPerUnlock: plan.episodesPerUnlock,
    platformUnlockHours: plan.platformUnlockHours,
    prices: { ...plan.prices },
  }
}

function toPatch(form: PlanForm): PlanPatch {
  return {
    vipPlatforms: form.vipPlatforms,
    popularShare: Math.min(100, Math.max(0, form.popularSharePct)) / 100,
    popularMinPlays: form.popularMinPlays,
    welcomeGiftEveryDays: form.welcomeGiftEveryDays,
    dailyRewards: form.dailyRewards,
    streakDays: form.streakDays,
    streakBonus: form.streakBonus,
    sharePoints: form.sharePoints,
    shareMaxPerDay: form.shareMaxPerDay,
    shareJoinBonus: form.shareJoinBonus,
    episodesPerUnlock: form.episodesPerUnlock,
    platformUnlockHours: form.platformUnlockHours,
    prices: form.prices,
  }
}

function NumField({
  id,
  label,
  value,
  onChange,
  max,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  max?: number
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
      />
    </div>
  )
}

export function FreePlanSection({
  plan,
  sources,
  onSaved,
}: {
  plan: Plan
  sources: SettingsSource[]
  onSaved: (config: Config) => void
}) {
  const [form, setForm] = useState<PlanForm>(() => toForm(plan))
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  function set<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setPrice<K extends keyof PlanPrices>(key: K, value: number) {
    setForm((prev) => ({ ...prev, prices: { ...prev.prices, [key]: value } }))
  }

  function setDaily(index: number, patch: Partial<DailyWeight>) {
    setForm((prev) => ({
      ...prev,
      dailyRewards: prev.dailyRewards.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }))
  }

  function togglePlatform(id: string, on: boolean) {
    setForm((prev) => ({
      ...prev,
      vipPlatforms: on ? [...prev.vipPlatforms.filter((p) => p !== id), id] : prev.vipPlatforms.filter((p) => p !== id),
    }))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateSettings({ plan: toPatch(form) })
      onSaved(updated)
      setForm(toForm(updated.plan))
      setNotice({ kind: 'ok', text: 'Free plan saved. It applies to every account from the next request.' })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      id="free-plan"
      title="Free plan"
      description="Which dramas need VIP, and what points buy. Free accounts see these rules everywhere; VIP accounts are not affected."
    >
      <form onSubmit={(e) => void save(e)} className="space-y-8">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">VIP platforms</legend>
          <p className="text-xs text-muted">Every drama on a checked platform needs VIP. Unchecked platforms are free.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => (
              <label
                key={source.id}
                className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-ink px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.vipPlatforms.includes(source.id)}
                  onChange={(e) => togglePlatform(source.id, e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="min-w-0 truncate">{source.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="text-sm font-semibold">Popular series</legend>
          <NumField
            id="plan-popular-share"
            label="Top share per platform (%)"
            value={form.popularSharePct}
            max={100}
            onChange={(v) => set('popularSharePct', v)}
          />
          <NumField
            id="plan-popular-min"
            label="Absolute play threshold (0 = off)"
            value={form.popularMinPlays}
            onChange={(v) => set('popularMinPlays', v)}
          />
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="text-sm font-semibold">Prices (points)</legend>
          <NumField id="plan-price-series" label="Whole series" value={form.prices.series} onChange={(v) => setPrice('series', v)} />
          <NumField
            id="plan-price-mylist"
            label="Whole series on My List"
            value={form.prices.seriesMyList}
            onChange={(v) => setPrice('seriesMyList', v)}
          />
          <NumField id="plan-price-episodes" label="Next episodes" value={form.prices.episodes} onChange={(v) => setPrice('episodes', v)} />
          <NumField id="plan-price-platform" label="VIP platform" value={form.prices.platform} onChange={(v) => setPrice('platform', v)} />
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="text-sm font-semibold">Points and sharing</legend>
          <NumField id="plan-share-points" label="Points per share" value={form.sharePoints} onChange={(v) => set('sharePoints', v)} />
          <NumField id="plan-share-max" label="Shares paid per day" value={form.shareMaxPerDay} onChange={(v) => set('shareMaxPerDay', v)} />
          <NumField
            id="plan-share-join"
            label="Bonus when a friend joins"
            value={form.shareJoinBonus}
            onChange={(v) => set('shareJoinBonus', v)}
          />
          <NumField id="plan-streak-days" label="Streak length (days)" value={form.streakDays} onChange={(v) => set('streakDays', v)} />
          <NumField id="plan-streak-bonus" label="Streak bonus (points)" value={form.streakBonus} onChange={(v) => set('streakBonus', v)} />
          <NumField
            id="plan-gift-days"
            label="Free VIP series gift every (days)"
            value={form.welcomeGiftEveryDays}
            onChange={(v) => set('welcomeGiftEveryDays', v)}
          />
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="text-sm font-semibold">Unlock lengths</legend>
          <NumField
            id="plan-episodes-per-unlock"
            label="Episodes per episode unlock"
            value={form.episodesPerUnlock}
            onChange={(v) => set('episodesPerUnlock', v)}
          />
          <NumField
            id="plan-platform-hours"
            label="Hours a platform unlock lasts"
            value={form.platformUnlockHours}
            onChange={(v) => set('platformUnlockHours', v)}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Daily reward odds</legend>
          <p className="text-xs text-muted">Each day one reward is picked at random, weighted by these numbers. Set a weight to 0 to switch it off.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {form.dailyRewards.map((reward, index) => (
              <div key={reward.kind} className="grid grid-cols-2 gap-3 rounded-md border border-line bg-ink p-3">
                <p className="col-span-2 text-sm font-medium">{DAILY_LABELS[reward.kind]}</p>
                {reward.kind !== 'series' && (
                  <div>
                    <label htmlFor={`plan-daily-value-${reward.kind}`} className="block text-xs text-muted">
                      {reward.kind === 'points' ? 'Points' : 'Episodes'}
                    </label>
                    <input
                      id={`plan-daily-value-${reward.kind}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={reward.value}
                      onChange={(e) => setDaily(index, { value: Number(e.target.value) })}
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor={`plan-daily-weight-${reward.kind}`} className="block text-xs text-muted">
                    Weight
                  </label>
                  <input
                    id={`plan-daily-weight-${reward.kind}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={reward.weight}
                    onChange={(e) => setDaily(index, { weight: Number(e.target.value) })}
                    className={`${inputClass} mt-1`}
                  />
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={saving} className={buttonClass()}>
            {saving ? 'Saving...' : 'Save free plan'}
          </button>
          {notice && <NoticeText notice={notice} />}
        </div>
      </form>
    </Section>
  )
}
