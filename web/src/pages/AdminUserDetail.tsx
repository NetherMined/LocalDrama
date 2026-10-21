import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  type ActivityCurrent,
  type ActivityProfile,
  type ActivityShow,
  type AdminUserActivity,
  type Device,
  type Show,
} from '../api'
import { ChevronLeftIcon } from '../components/icons'
import { ShowCard, showGridClass, showPath } from '../components/ShowCard'
import { Toast, useToast } from '../components/Toast'
import { UserActions } from '../components/UserActions'
import { RoleBadge, StatusBadges, UserInitial } from '../components/UserBadges'
import { WatchChart } from '../components/WatchChart'
import { EmptyState, ErrorPanel, LoadError, Poster } from '../components/ui'
import { errorMessage, fmtAgo, fmtAgoOrNever, fmtDate, fmtEpisode, fmtWatchTime } from '../lib/format'
import { useStatus } from '../status'

function toCardShow(show: ActivityShow): Show {
  return {
    bookId: show.bookId,
    name: show.name,
    cover: show.cover,
    introduction: show.introduction ?? '',
    episodeCount: show.episodeCount ?? 0,
    playCount: show.playCount ?? 0,
    tags: show.tags ?? [],
    status: show.status ?? undefined,
    source: show.source ?? undefined,
    sourceName: show.sourceName ?? undefined,
  }
}

function sumProfiles(profiles: ActivityProfile[]) {
  return profiles.reduce(
    (acc, p) => ({
      total: acc.total + p.watchSeconds.total,
      d7: acc.d7 + p.watchSeconds.d7,
      d30: acc.d30 + p.watchSeconds.d30,
      watching: acc.watching + p.currentlyWatching.length,
      favourites: acc.favourites + p.favourites.length,
    }),
    { total: 0, d7: 0, d30: 0, watching: 0, favourites: 0 },
  )
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h3 id={id} className="text-base font-bold">
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading user" className="space-y-6">
      <div className="h-32 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
    </div>
  )
}

export function AdminUserDetail() {
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const validId = Number.isInteger(id) && id > 0
  const navigate = useNavigate()
  const selfId = useStatus().status?.account?.id
  const [data, setData] = useState<AdminUserActivity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [toast, notify] = useToast()
  const uid = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const load = useCallback(async () => {
    if (!validId) return
    try {
      setData(await api.adminUserActivity(id))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [id, validId])

  useEffect(() => {
    void load()
  }, [load])

  if (!validId) {
    return (
      <ErrorPanel title="User not found" message="That link does not point to an account." />
    )
  }

  if (!data || data.account.id !== id) {
    if (error) {
      return (
        <>
          <BackLink />
          <LoadError title="Could not load this user" message={error} onRetry={() => void load()} />
        </>
      )
    }
    return (
      <>
        <BackLink />
        <DetailSkeleton />
      </>
    )
  }

  const { account, devices, profiles } = data
  const totals = sumProfiles(profiles)
  const profile = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null
  const isSelf = account.id === selfId

  const tiles = [
    { label: 'Total watch time', value: fmtWatchTime(totals.total) },
    { label: 'Last 7 days', value: fmtWatchTime(totals.d7) },
    { label: 'Last 30 days', value: fmtWatchTime(totals.d30) },
    { label: 'Currently watching', value: String(totals.watching) },
    { label: 'Favourites', value: String(totals.favourites) },
  ]

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % profiles.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + profiles.length) % profiles.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = profiles.length - 1
    if (next === null) return
    e.preventDefault()
    setSelectedId(profiles[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-col gap-5 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <UserInitial username={account.username} className="h-14 w-14 text-2xl" />
          <div className="min-w-0">
            <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="truncate">{account.username}</span>
              {isSelf && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">You</span>
              )}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <RoleBadge role={account.role} />
              <StatusBadges user={account} />
            </p>
            <p className="mt-2 text-sm text-muted">
              Created {fmtDate(account.createdAt)} · Last login {fmtAgoOrNever(account.lastLoginAt)}
            </p>
          </div>
        </div>
        <UserActions
          user={account}
          isSelf={isSelf}
          variant="buttons"
          onChanged={() => void load()}
          onDeleted={() => navigate('/admin/users')}
          onNotify={notify}
        />
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">{tile.label}</p>
            <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{tile.value}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby={`${uid}-profiles`} className="space-y-4">
        <h2 id={`${uid}-profiles`} className="text-lg font-bold">
          Profiles
        </h2>
        {profiles.length === 0 || !profile ? (
          <EmptyState title="No profiles yet" />
        ) : (
          <>
            <div role="tablist" aria-label="Profiles" className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {profiles.map((p, index) => {
                const selected = p.id === profile.id
                return (
                  <button
                    key={p.id}
                    ref={(el) => {
                      tabRefs.current[index] = el
                    }}
                    type="button"
                    role="tab"
                    id={`${uid}-tab-${p.id}`}
                    aria-selected={selected}
                    aria-controls={`${uid}-panel-${p.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => onTabKey(e, index)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      selected
                        ? 'border-accent bg-accent text-white'
                        : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </button>
                )
              })}
            </div>

            <div
              role="tabpanel"
              id={`${uid}-panel-${profile.id}`}
              aria-labelledby={`${uid}-tab-${profile.id}`}
              className="space-y-5"
            >
              <Panel id={`${uid}-watch`} title="Watch time, last 30 days">
                <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted">Total</p>
                    <p className="font-semibold tabular-nums">{fmtWatchTime(profile.watchSeconds.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Last 7 days</p>
                    <p className="font-semibold tabular-nums">{fmtWatchTime(profile.watchSeconds.d7)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Last 30 days</p>
                    <p className="font-semibold tabular-nums">{fmtWatchTime(profile.watchSeconds.d30)}</p>
                  </div>
                </div>
                <WatchChart daily={profile.daily} />
              </Panel>

              <Panel id={`${uid}-current`} title={`Currently watching (${profile.currentlyWatching.length})`}>
                {profile.currentlyWatching.length === 0 ? (
                  <p className="text-sm text-muted">Nothing in progress in the last 14 days.</p>
                ) : (
                  <ul className={`${showGridClass} list-none`}>
                    {profile.currentlyWatching.map((c) => (
                      <li key={`${c.kind}-${c.show.bookId}-${c.episodeIndex}`}>
                        <ShowCard
                          show={toCardShow(c.show)}
                          progress={c.percent / 100}
                          caption={<WatchCaption item={c} />}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel id={`${uid}-watched`} title={`Watched (${profile.watched.length})`}>
                {profile.watched.length === 0 ? (
                  <p className="text-sm text-muted">No finished episodes yet.</p>
                ) : (
                  <ul className="divide-y divide-white/10">
                    {profile.watched.map((w) => {
                      const show = toCardShow(w.show)
                      return (
                        <li key={show.bookId}>
                          <Link
                            to={showPath(show)}
                            className="group/user flex items-center gap-4 rounded-md py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent-hi"
                          >
                            <div className="w-24 shrink-0 overflow-hidden rounded-md sm:w-32">
                              <Poster src={show.cover} name={show.name} aspect="landscape" />
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-1 font-medium group-hover/user:text-accent-text">{show.name}</p>
                              <p className="mt-1 text-xs text-muted">
                                {w.episodes} {w.episodes === 1 ? 'episode' : 'episodes'} · last watched{' '}
                                {fmtAgo(w.lastWatchedAt)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>

              <Panel id={`${uid}-favourites`} title={`Favourites (${profile.favourites.length})`}>
                {profile.favourites.length === 0 ? (
                  <p className="text-sm text-muted">No favourites yet.</p>
                ) : (
                  <ul className={`${showGridClass} list-none`}>
                    {profile.favourites.map((f) => {
                      const show = toCardShow(f)
                      return (
                        <li key={show.bookId}>
                          <ShowCard show={show} />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </section>

      <DevicesPanel id={`${uid}-devices`} devices={devices} />

      <Toast toast={toast} />
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/admin/users" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted transition hover:text-white">
      <ChevronLeftIcon className="h-4 w-4" />
      Users
    </Link>
  )
}

function WatchCaption({ item }: { item: ActivityCurrent }) {
  return (
    <>
      <span className="mr-1.5 rounded bg-white/10 px-1 py-px align-middle text-[9px] font-bold tracking-wider text-white/80 uppercase">
        {item.kind === 'stream' ? 'Streamed' : 'Downloaded'}
      </span>
      {`${fmtEpisode(item.episodeIndex)} · ${item.percent}%`}
    </>
  )
}

function DevicesPanel({ id, devices }: { id: string; devices: Device[] }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 id={id} className="text-lg font-bold">
        Devices ({devices.length})
      </h2>
      {devices.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No devices have signed in yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10">
          {devices.map((d) => (
            <li key={d.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
              <p className="truncate font-medium">{d.name}</p>
              <p className="text-xs text-muted">
                <span className="text-white/50">IP </span>
                <span className="font-mono break-all">{d.ip || 'unknown'}</span>
              </p>
              <p className="text-xs text-muted">
                <span className="text-white/50">First seen </span>
                {fmtDate(d.firstSeenAt)}
              </p>
              <p className="text-xs text-muted">
                <span className="text-white/50">Last seen </span>
                {fmtAgo(d.lastSeenAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
