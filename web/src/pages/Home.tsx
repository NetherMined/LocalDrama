import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ContinueItem, type HomeData, type Show } from '../api'
import { ShowCard } from '../components/ShowCard'
import { ShowRow, ShowRowSkeleton } from '../components/ShowRow'
import { RefreshIcon } from '../components/icons'
import { LoadError, Poster, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode, fmtMinutesLeft } from '../lib/format'

const SKELETON_ROWS = ['Continue Watching', 'Latest', 'Interests']

export function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([])
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'source'>('default')

  const load = useCallback(async (refresh: boolean) => {
    setRefreshing(true)
    try {
      setData(await api.home(refresh))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    let cancelled = false
    api
      .continueWatching()
      .then((res) => {
        if (!cancelled) setContinueItems(res.items)
      })
      .catch(() => {
        if (!cancelled) setContinueItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sortedRows = useMemo(() => {
    if (!data?.rows) return []
    const rows = [...data.rows]
    if (sortBy === 'name') {
      return rows.sort((a, b) => a.title.localeCompare(b.title))
    }
    if (sortBy === 'source') {
      return rows.sort((a, b) => (a.source || '').localeCompare(b.source || ''))
    }
    return rows
  }, [data, sortBy])

  if (!data && error) return <LoadError title="Could not load the home page" message={error} onRetry={() => void load(false)} />

  if (!data) {
    return (
      <div className="space-y-10" aria-busy="true" aria-label="Loading home">
        <div className="h-72 animate-pulse rounded-xl bg-panel-2 sm:h-80" />
        {SKELETON_ROWS.map((title) => (
          <ShowRowSkeleton key={title} title={title} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-muted">Sort rows</label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-md border border-line bg-ink px-3 py-1.5 text-sm"
          >
            <option value="default">Default</option>
            <option value="name">Name</option>
            <option value="source">Source</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh"
            title="Refresh"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-panel-2 text-white transition hover:bg-line disabled:opacity-40"
          >
            <RefreshIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {data.hero && <Hero show={data.hero} />}

      {continueItems.length > 0 && (
        <ShowRow
          title="Currently Watching"
          items={continueItems}
          itemKey={(item) => `${item.show.bookId}-${String(item.episode.id)}`}
          render={(item) => <ContinueCard item={item} />}
        />
      )}

      {sortedRows
        .filter((row) => (row.items?.length ?? 0) > 0 || row.note)
        .map((row) => (
          <div key={row.key}>
            <ShowRow
              title={row.title}
              items={row.items || []}
              itemKey={(show) => show.bookId}
              render={(show) => <ShowCard show={show} />}
            />
            {row.note && <p className="mt-1 text-xs text-muted">{row.note}</p>}
          </div>
        ))}

      {data.errors?.length > 0 && (
        <ul className="space-y-1">
          {data.errors.map((e) => (
            <li key={e.key} className="text-xs text-muted">
              {e.key} unavailable: {e.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ContinueCard({ item }: { item: ContinueItem }) {
  const { show, episode, position, duration } = item
  const to = `/watch/${encodeURIComponent(show.bookId)}/${encodeURIComponent(String(episode.id))}`
  const progress = duration > 0 ? position / duration : 0
  const caption =
    position > 0
      ? `${fmtEpisode(episode.episodeIndex)} · ${fmtMinutesLeft(position, duration)}`
      : `Up next: ${fmtEpisode(episode.episodeIndex)}`
  return <ShowCard show={show} to={to} progress={progress} caption={caption} />
}

function Hero({ show }: { show: Show }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function downloadAll() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await api.enqueue(show.bookId)
      setNotice({
        kind: 'ok',
        text: res.added === 1 ? 'Added 1 episode to downloads.' : `Added ${res.added} episodes to downloads.`,
      })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Featured drama" className="relative isolate overflow-hidden rounded-xl border border-line bg-panel">
      {show.cover && (
        <img
          src={show.cover}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/40" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-transparent to-transparent" />

      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-end sm:gap-8 sm:p-10">
        <div className="w-28 shrink-0 sm:w-48 md:w-56">
          <Poster src={show.cover} name={show.name} className="rounded-lg shadow-2xl shadow-black/70" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <h1 className="line-clamp-2 text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">{show.name}</h1>
          {show.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Tags">
              {show.tags.slice(0, 6).map((tag) => (
                <li key={tag} className="rounded-full border border-line bg-ink/60 px-3 py-1 text-xs text-white/80">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          {show.introduction && (
            <p className="line-clamp-3 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">{show.introduction}</p>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            <Link to={`/show/${encodeURIComponent(show.bookId)}`} className={buttonClass('ghost')}>
              View
            </Link>
            <button type="button" onClick={() => void downloadAll()} disabled={busy} className={buttonClass()}>
              {busy ? 'Queuing...' : 'Download all'}
            </button>
          </div>
          {notice && (
            <p role="status" className={`text-sm ${notice.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
              {notice.text}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
