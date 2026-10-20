import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Page, Show } from '../api'
import { errorMessage } from '../lib/format'
import { ShowCard } from './ShowCard'
import { EmptyState, LoadError, buttonClass } from './ui'

interface Props {
  resetKey: string
  load: (page: number) => Promise<Page<Show>>
  emptyTitle: string
  emptyHint?: ReactNode
  emptyAction?: ReactNode
}

export function ShowGrid({ resetKey, load, emptyTitle, emptyHint, emptyAction }: Props) {
  const [items, setItems] = useState<Show[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const fetchPage = useCallback(
    async (target: number, replace: boolean) => {
      const request = ++latestRequest.current
      setLoading(true)
      setError(null)
      try {
        const res = await load(target)
        if (request !== latestRequest.current) return
        setItems((prev) => {
          if (replace) return dedupe(res.items)
          return dedupe([...prev, ...res.items])
        })
        setPage(target)
        setHasMore(res.hasMore)
      } catch (err) {
        if (request !== latestRequest.current) return
        setError(errorMessage(err))
      } finally {
        if (request === latestRequest.current) setLoading(false)
      }
    },
    [load],
  )

  useEffect(() => {
    setItems([])
    void fetchPage(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  if (error && items.length === 0) {
    return <LoadError message={error} onRetry={() => void fetchPage(1, true)} />
  }

  if (loading && items.length === 0) return <ShowGridSkeleton />

  if (!loading && items.length === 0) {
    return (
      <EmptyState title={emptyTitle}>
        {emptyHint}
        {emptyAction && <div className="mt-4 flex justify-center">{emptyAction}</div>}
      </EmptyState>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((show) => (
          <ShowCard key={show.bookId} show={show} />
        ))}
      </div>
      {error && (
        <div className="mt-6">
          <LoadError message={error} onRetry={() => void fetchPage(page + 1, false)} />
        </div>
      )}
      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => void fetchPage(page + 1, false)}
            disabled={loading}
            className={buttonClass('ghost')}
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

export function ShowGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-video rounded-md bg-panel-2" />
          <div className="mt-2 h-3 w-3/4 rounded bg-panel-2" />
        </div>
      ))}
    </div>
  )
}

function dedupe(list: Show[]): Show[] {
  const seen = new Set<string>()
  return list.filter((s) => {
    if (seen.has(s.bookId)) return false
    seen.add(s.bookId)
    return true
  })
}
