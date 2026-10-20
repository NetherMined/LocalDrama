import { useEffect, useState } from 'react'
import { api, type Show } from '../api'
import { ShowCard } from '../components/ShowCard'
import { LoadError, PageHeader } from '../components/ui'
import { errorMessage } from '../lib/format'

export function Favourites() {
  const [items, setItems] = useState<Show[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .favourites()
      .then((res) => {
        if (!cancelled) setItems(res.items)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <LoadError title="Could not load favourites" message={error} />

  return (
    <div className="space-y-6">
      <PageHeader title="My Favourites" />
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
          You have not favourited any shows yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((show) => (
            <ShowCard key={show.bookId} show={show} />
          ))}
        </div>
      )}
    </div>
  )
}
