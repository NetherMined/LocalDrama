import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type BrowseCategory, type BrowseSort, type BrowseSources } from '../api'
import { ShowGrid, ShowGridSkeleton } from '../components/ShowGrid'
import { buttonClass } from '../components/ui'
import { errorMessage } from '../lib/format'

const SORTS: { value: BrowseSort; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'popular', label: 'Most popular' },
  { value: 'name', label: 'A–Z' },
  { value: 'episodes', label: 'Most episodes' },
]

const selectClass =
  'w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-white outline-none focus:border-accent-hi'

export function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sources, setSources] = useState<BrowseSources | null>(null)
  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [categories, setCategories] = useState<{ source: string; items: BrowseCategory[] } | null>(null)

  const sourceParam = searchParams.get('source') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const sortParam = searchParams.get('sort') ?? ''
  const sort: BrowseSort = SORTS.some((s) => s.value === sortParam) ? (sortParam as BrowseSort) : 'latest'
  const popularView = sort === 'popular' && !tag
  const hasFilters = Boolean(sourceParam || tag || sort !== 'latest')

  useEffect(() => {
    let cancelled = false
    api
      .browseSources()
      .then((res) => {
        if (!cancelled) setSources(res)
      })
      .catch((err) => {
        if (!cancelled) setSourcesError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ready = sources !== null || sourcesError !== null
  const activeSourceId = sources?.activeSourceId ?? ''
  const source = sourceParam || activeSourceId
  const platformName = sources?.sources.find((s) => s.id === source)?.name ?? source

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    api
      .categories(source || undefined)
      .then((res) => {
        if (!cancelled) setCategories({ source, items: res.categories })
      })
      .catch(() => {
        if (!cancelled) setCategories({ source, items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [ready, source])

  const categoriesLoading = categories === null || categories.source !== source
  const categoryItems = categories && !categoriesLoading ? categories.items : []
  const showCategories = ready && (categoriesLoading || categoryItems.length > 0)

  const load = useCallback((page: number) => api.latest(page, { source, tag, sort }), [source, tag, sort])

  function updateParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams)
    mutate(next)
    setSearchParams(next)
  }

  function choosePlatform(id: string) {
    updateParams((next) => {
      next.delete('tag')
      if (id === activeSourceId) next.delete('source')
      else next.set('source', id)
    })
  }

  function chooseSort(value: BrowseSort) {
    updateParams((next) => {
      if (value === 'latest') next.delete('sort')
      else next.set('sort', value)
    })
  }

  function chooseTag(name: string) {
    updateParams((next) => {
      if (name) next.set('tag', name)
      else next.delete('tag')
    })
  }

  const subtitle = [platformName, tag].filter(Boolean).join(' · ')

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{popularView ? 'New & Popular' : 'Browse'}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>

      <div className="sticky top-[92px] z-30 -mx-4 mb-6 bg-black/90 px-4 pt-3 pb-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="block w-full sm:w-56">
            <span className="sr-only">Platform</span>
            <select value={source} onChange={(e) => choosePlatform(e.target.value)} disabled={!sources} className={selectClass}>
              {!sources && <option value="">Loading platforms</option>}
              {sources?.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-full sm:w-56">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => chooseSort(e.target.value as BrowseSort)} className={selectClass}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showCategories && (
          <div
            role="toolbar"
            aria-label="Categories"
            aria-busy={categoriesLoading}
            className="no-scrollbar -mx-4 mt-3 flex snap-x gap-2 overflow-x-auto scroll-px-4 px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6"
          >
            {categoriesLoading ? (
              Array.from({ length: 6 }, (_, i) => (
                <span key={i} aria-hidden="true" className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-panel-2" />
              ))
            ) : (
              <>
                <CategoryChip label="All" active={!tag} onClick={() => chooseTag('')} />
                {categoryItems.map((c) => (
                  <CategoryChip
                    key={c.name}
                    label={c.name}
                    count={c.count}
                    active={tag === c.name}
                    onClick={() => chooseTag(c.name)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {sourcesError && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {sourcesError}
        </p>
      )}

      {ready ? (
        <ShowGrid
          resetKey={`${source}|${tag}|${sort}`}
          load={load}
          emptyTitle={`No ${tag ? `${tag} ` : ''}dramas${platformName ? ` on ${platformName}` : ''}`}
          emptyHint={hasFilters ? 'Try another category or platform.' : 'The catalogue returned nothing. Try again later.'}
          emptyAction={
            hasFilters ? (
              <Link to="/browse" className={buttonClass('ghost')}>
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ShowGridSkeleton />
      )}
    </>
  )
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 snap-start rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition ${
        active ? 'bg-white font-semibold text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'
      }`}
    >
      {label}
      {!active && count !== undefined && <span className="ml-1.5 text-xs text-muted">{count}</span>}
    </button>
  )
}
