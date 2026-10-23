import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { ContinueCard, continueEntries, type ContinueEntry } from '../components/ContinueCard'
import { EmptyState, LoadError, PageHeader, buttonClass } from '../components/ui'
import { showGridClass } from '../components/ShowCard'
import { ShowGridSkeleton } from '../components/ShowGrid'
import { errorMessage } from '../lib/format'

export function History() {
  const [entries, setEntries] = useState<ContinueEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .watchContinue()
      .then((res) => {
        if (!cancelled) setEntries(continueEntries(res.items))
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

  if (error) return <LoadError title="Could not load continue watching" message={error} />

  return (
    <div className="space-y-6">
      <PageHeader title="Continue watching" />
      {loading ? (
        <ShowGridSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState title="Nothing in progress yet">
          <p>Shows you start watching will appear here.</p>
          <Link to="/" className={`${buttonClass('ghost')} mt-4`}>
            Back to home
          </Link>
        </EmptyState>
      ) : (
        <div className={showGridClass}>
          {entries.map((entry) => (
            <ContinueCard key={entry.show.bookId} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
