import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ContinueItem, type HomeData } from '../api'
import { Hero } from '../components/Hero'
import { ShowCard } from '../components/ShowCard'
import { ShowRow, ShowRowSkeleton } from '../components/ShowRow'
import { RefreshIcon } from '../components/icons'
import { LoadError, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode, fmtMinutesLeft } from '../lib/format'

const SKELETON_ROWS = ['Currently Watching', 'Latest', 'Trending Now']
const CONTINUE_ID = 'continue-watching'

export function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([])

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

  if (!data && error) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-10">
        <LoadError title="Could not load the home page" message={error} onRetry={() => void load(false)} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-10" aria-busy="true" aria-label="Loading home">
        <div className="h-[70vh] min-h-[420px] animate-pulse bg-panel-2" />
        {SKELETON_ROWS.map((title) => (
          <ShowRowSkeleton key={title} title={title} />
        ))}
      </div>
    )
  }

  const rows = data.rows.filter((row) => (row.items?.length ?? 0) > 0)
  const hasContinue = continueItems.length > 0

  function scrollToContinue() {
    if (hasContinue) document.getElementById(CONTINUE_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const refreshButton = (
    <button
      type="button"
      onClick={() => void load(true)}
      disabled={refreshing}
      aria-label="Refresh"
      title="Refresh"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
    >
      <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
    </button>
  )

  return (
    <div className="pb-12">
      {data.hero && <Hero show={data.hero} hasContinue={hasContinue} onContinue={scrollToContinue} />}

      <div className="space-y-8 px-4 pt-2 sm:px-6 lg:px-10">
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        {hasContinue && (
          <ShowRow
            id={CONTINUE_ID}
            title="Currently Watching"
            items={continueItems}
            itemKey={(item) => `${item.show.bookId}-${String(item.episode.id)}`}
            render={(item) => <ContinueCard item={item} />}
            action={refreshButton}
          />
        )}

        {rows.length > 0 ? (
          rows.map((row, index) => (
            <ShowRow
              key={row.key}
              title={row.title}
              items={row.items}
              itemKey={(show) => show.bookId}
              render={(show) => <ShowCard show={show} />}
              action={index === 0 && !hasContinue ? refreshButton : undefined}
            />
          ))
        ) : (
          <div className="rounded-xl border border-line bg-panel px-6 py-12 text-center">
            <p className="text-lg font-medium">No shows available yet</p>
            <p className="mt-2 text-sm text-muted">
              Configure a source (DramaBuzz / GoodBos) with a valid API key in Settings, then refresh.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link to="/settings" className={buttonClass('ghost')}>
                Open Settings
              </Link>
              {refreshButton}
            </div>
          </div>
        )}

        {data.errors?.length > 0 && (
          <ul className="space-y-1">
            {data.errors.map((e) => (
              <li key={e.key} className="line-clamp-2 text-xs break-all text-muted">
                {e.key}: {e.error}
              </li>
            ))}
          </ul>
        )}
      </div>
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
