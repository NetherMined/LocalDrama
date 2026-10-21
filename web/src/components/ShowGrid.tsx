import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Page, Show } from '../api'
import { errorMessage } from '../lib/format'
import { ShowCard, showGridClass } from './ShowCard'
import { EmptyState, LoadError, buttonClass } from './ui'

interface Props {
  resetKey: string
  load: (page: number) => Promise<Page<Show>>
  emptyTitle: string
  emptyHint?: ReactNode
  emptyAction?: ReactNode
}

const canObserve = typeof window !== 'undefined' && 'IntersectionObserver' in window

export function ShowGrid({ resetKey, load, emptyTitle, emptyHint, emptyAction }: Props) {
  const [items, setItems] = useState<Show[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const latestRequest = useRef(0)
  const loadingRef = useRef(false)
  const itemsRef = useRef<Show[]>([])
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const fetchPage = useCallback(
    async (target: number, replace: boolean) => {
      const request = ++latestRequest.current
      loadingRef.current = true
      setLoading(true)
      setError(null)
      try {
        const res = await load(target)
        if (request !== latestRequest.current) return
        const base = replace ? [] : itemsRef.current
        const next = dedupe([...base, ...res.items])
        const added = next.length - base.length
        itemsRef.current = next
        setItems(next)
        setPage(target)
        // A page that adds nothing new ends the feed, so the sentinel cannot keep re-requesting it.
        setHasMore(res.hasMore && (replace || added > 0))
        if (!replace) setAnnouncement(added > 0 ? `Loaded ${added} more dramas` : '')
      } catch (err) {
        if (request !== latestRequest.current) return
        setError(errorMessage(err))
      } finally {
        if (request === latestRequest.current) {
          loadingRef.current = false
          setLoading(false)
        }
      }
    },
    [load],
  )

  useEffect(() => {
    itemsRef.current = []
    setItems([])
    setPage(0)
    setHasMore(false)
    setAnnouncement('')
    void fetchPage(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const loadNext = useCallback(() => {
    if (loadingRef.current) return
    void fetchPage(page + 1, false)
  }, [fetchPage, page])

  const canLoadMore = hasMore && !loading && !error

  useEffect(() => {
    const node = sentinelRef.current
    if (!canLoadMore || !canObserve || !node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNext()
      },
      { rootMargin: '800px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [canLoadMore, loadNext])

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

  const showEnd = !hasMore && !loading && !error && page > 1

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className={showGridClass}>
        {items.map((show) => (
          <ShowCard key={show.bookId} show={show} />
        ))}
      </div>
      {loading && items.length > 0 && (
        <div className="mt-8">
          <ShowGridSkeleton count={5} />
        </div>
      )}
      {error && items.length > 0 && (
        <div role="alert" className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-sm whitespace-pre-line text-red-300">{error}</p>
          <button type="button" onClick={() => void fetchPage(page + 1, false)} className={buttonClass('ghost')}>
            Retry
          </button>
        </div>
      )}
      {hasMore && (
        <>
          <div ref={sentinelRef} aria-hidden="true" className="h-px" />
          {!error && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={loadNext}
                disabled={loading}
                className={
                  canObserve
                    ? `${buttonClass('ghost')} sr-only focus:not-sr-only`
                    : buttonClass('ghost')
                }
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
      {showEnd && <p className="mt-10 text-center text-sm text-muted">{"You've reached the end"}</p>}
    </div>
  )
}

export function ShowGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={showGridClass} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[2/3] rounded-md bg-panel-2" />
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
