import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type HomeData, type HomeRow } from '../api'
import { ContinueCard, continueEntries, type ContinueEntry } from '../components/ContinueCard'
import { Hero } from '../components/Hero'
import { ShowCard } from '../components/ShowCard'
import { ShowRow, ShowRowSkeleton } from '../components/ShowRow'
import { RefreshIcon } from '../components/icons'
import { LoadError, buttonClass } from '../components/ui'
import { errorMessage } from '../lib/format'
import { useStatus } from '../status'

const SKELETON_ROWS = ['Currently Watching', 'Latest', 'Trending Now']
const CONTINUE_ID = 'continue-watching'
const CONTINUE_LIMIT = 20

export function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [continueItems, setContinueItems] = useState<ContinueEntry[]>([])
  const { status } = useStatus()
  const signedIn = !!status?.authenticated

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
    if (!signedIn) return
    let cancelled = false
    api
      .watchContinue()
      .then((res) => {
        if (!cancelled) setContinueItems(continueEntries(res.items).slice(0, CONTINUE_LIMIT))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (!data && error) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-10">
        <LoadError title="Could not load the home page" message={error} onRetry={() => void load(false)} />
      </div>
    )
  }

  if (!data) {
    return (
      <div aria-busy="true" aria-label="Loading home">
        <div className="-mt-16 h-[70svh] min-h-[460px] animate-pulse bg-panel-2 sm:-mt-28 sm:h-[min(85vh,760px)] sm:min-h-[520px] short:h-[88svh] short:min-h-0" />
        <div className="space-y-10 px-4 pt-8 pb-6 sm:px-6 sm:pt-10 lg:px-10">
          {SKELETON_ROWS.map((title) => (
            <ShowRowSkeleton key={title} title={title} />
          ))}
        </div>
      </div>
    )
  }

  const rows = data.rows.filter((row) => (row.items?.length ?? 0) > 0)
  const hasContinue = continueItems.length > 0
  const featured = data.featured?.length ? data.featured : data.hero ? [data.hero] : []

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
      {featured.length > 0 && <Hero shows={featured} />}

      <div className="space-y-10 px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
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
            itemKey={(item) => item.show.bookId}
            render={(item) => <ContinueCard entry={item} />}
            action={refreshButton}
            viewAllHref="/history"
          />
        )}

        {rows.length > 0 ? (
          rows.map((row, index) => (
            <ShowRow
              key={row.key}
              title={row.title}
              items={row.items}
              itemKey={(show) => show.bookId}
              render={(show) => (
                <ShowCard show={show} badge={row.key === 'trending' && !show.badge ? 'Trending' : undefined} />
              )}
              action={index === 0 && !hasContinue && signedIn ? refreshButton : undefined}
              logo={row.key.startsWith('latest-') ? row.source : undefined}
              viewAllHref={rowViewAllHref(row)}
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

function rowViewAllHref(row: HomeRow): string | undefined {
  if (row.key.startsWith('latest-') && row.source) return `/browse?source=${encodeURIComponent(row.source)}`
  if (row.key === 'trending') return '/browse?sort=latest'
  if (row.key === 'new-popular') return '/browse?sort=popular'
  if (row.key.startsWith('genre-')) return `/browse?tag=${encodeURIComponent(row.title)}`
  return undefined
}
