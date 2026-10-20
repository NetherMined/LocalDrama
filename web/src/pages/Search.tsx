import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type SearchError, type SearchPlatform, type Show } from '../api'
import { ShowCard } from '../components/ShowCard'
import { ShowGrid } from '../components/ShowGrid'
import { EmptyState, PageHeader, buttonClass } from '../components/ui'

function chipClass(active: boolean) {
  return `inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
    active
      ? 'border-white bg-white text-black'
      : 'border-line bg-panel-2 text-white/80 hover:border-white/40 hover:text-white'
  }`
}

export function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const source = (params.get('source') ?? '').trim()
  const key = `${q}|${source}`

  const [platformState, setPlatformState] = useState<{ q: string; platforms: SearchPlatform[] } | null>(null)
  const [errorState, setErrorState] = useState<{ key: string; errors: SearchError[] }>({ key: '', errors: [] })

  const needsPlatforms = Boolean(q && source) && platformState?.q !== q
  // Local index results paint immediately; the full multi-platform search replaces them when it lands.
  const [quick, setQuick] = useState<{ key: string; items: Show[] } | null>(null)
  const [fullKey, setFullKey] = useState('')
  const fullReady = fullKey === key

  useEffect(() => {
    if (!q) return
    let cancelled = false
    api
      .search(q, 1, source || undefined, true)
      .then((res) => {
        if (!cancelled) setQuick({ key, items: res.items })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [q, source, key])

  useEffect(() => {
    if (!needsPlatforms) return
    let cancelled = false
    api
      .search(q)
      .then((res) => {
        if (!cancelled) setPlatformState({ q, platforms: res.platforms ?? [] })
      })
      .catch(() => {
        if (!cancelled) setPlatformState({ q, platforms: [] })
      })
    return () => {
      cancelled = true
    }
  }, [needsPlatforms, q])

  const load = useCallback(
    async (page: number) => {
      const res = await api.search(q, page, source || undefined)
      if (page === 1) {
        setFullKey(`${q}|${source}`)
        setErrorState({ key: `${q}|${source}`, errors: res.errors ?? [] })
        if (!source) setPlatformState({ q, platforms: res.platforms ?? [] })
      }
      return res
    },
    [q, source],
  )

  if (!q) {
    return (
      <>
        <PageHeader title="Search" />
        <EmptyState title="Type a drama name in the search box" />
      </>
    )
  }

  const platforms = platformState?.q === q ? platformState.platforms : []
  const total = platforms.reduce((sum, p) => sum + p.count, 0)
  const errors = errorState.key === key ? errorState.errors : []
  const failedNames = errors.map((e) => e.name || e.source)

  function searchHref(sourceId?: string) {
    const next = new URLSearchParams({ q })
    if (sourceId) next.set('source', sourceId)
    return `/search?${next.toString()}`
  }

  return (
    <>
      <PageHeader title={`Results for “${q}”`} />
      {(platforms.length > 0 || total > 0) && (
        <p className="-mt-2 mb-5 text-sm text-muted">
          {total} {total === 1 ? 'drama' : 'dramas'}
        </p>
      )}
      {platforms.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by platform">
          <Link to={searchHref()} className={chipClass(!source)} aria-current={!source ? 'true' : undefined}>
            All {total}
          </Link>
          {platforms.map((platform) => (
            <Link
              key={platform.id}
              to={searchHref(platform.id)}
              className={chipClass(source === platform.id)}
              aria-current={source === platform.id ? 'true' : undefined}
            >
              {platform.name} {platform.count}
            </Link>
          ))}
        </div>
      )}
      {failedNames.length > 0 && (
        <p className="mb-6 text-sm text-muted">Could not search {failedNames.join(', ')} right now.</p>
      )}
      {!fullReady && quick?.key === key && quick.items.length > 0 && (
        <div className="mb-8">
          <p className="mb-4 flex items-center gap-2 text-sm text-muted" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            Top matches · searching all platforms…
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {quick.items.map((show) => (
              <ShowCard key={`${show.source ?? ''}:${show.bookId}`} show={show} />
            ))}
          </div>
        </div>
      )}
      <div className={!fullReady && quick?.key === key && quick.items.length > 0 ? 'hidden' : undefined}>
        <ShowGrid
          resetKey={`search:${key}`}
          load={load}
          emptyTitle={`No dramas match “${q}”`}
          emptyHint="Try a shorter word or browse categories."
          emptyAction={
            <Link to="/browse" className={buttonClass('ghost')}>
              Browse categories
            </Link>
          }
        />
      </div>
    </>
  )
}
