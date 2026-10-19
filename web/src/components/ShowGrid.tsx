import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Page, Show } from '../api'
import { errorMessage } from '../lib/format'
import { ShowCard } from './ShowCard'
import { EmptyState, GridSkeleton, LoadError, buttonClass } from './ui'

interface Props {
  resetKey: string
  load: (page: number) => Promise<Page<Show>>
  emptyTitle: string
  emptyHint?: ReactNode
}

export function ShowGrid({ resetKey, load, emptyTitle, emptyHint }: Props) {
  const [items, setItems] = useState<Show[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    async (target: number, replace: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const res = await load(target)
        setItems((prev) => {
          if (replace) return dedupe(res.items)
          return dedupe([...prev, ...res.items])
        })
        setPage(target)
        setHasMore(res.hasMore)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setLoading(false)
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

  if (loading && items.length === 0) return <GridSkeleton />

  if (!loading && items.length === 0) {
    return (
      <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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

function dedupe(list: Show[]): Show[] {
  const seen = new Set<string>()
  return list.filter((s) => {
    if (seen.has(s.bookId)) return false
    seen.add(s.bookId)
    return true
  })
}
