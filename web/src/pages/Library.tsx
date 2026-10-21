import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useEvents, type LibraryShow } from '../api'
import { showGridClass } from '../components/ShowCard'
import { EmptyState, GridSkeleton, LoadError, PageHeader, Poster, buttonClass } from '../components/ui'
import { errorMessage } from '../lib/format'
import { useStatus } from '../status'

export function Library() {
  const isAdmin = useStatus().status?.account?.role === 'admin'
  const [shows, setShows] = useState<LibraryShow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .library()
      .then((res) => {
        setShows(res.shows)
        setError(null)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEvents((event) => {
    if (event.type === 'library' || event.type === 'open') load()
  })

  async function scan() {
    setScanning(true)
    setScanError(null)
    setScanResult(null)
    try {
      const res = await api.scanLibrary()
      setScanResult(`Scan complete: ${res.added} added, ${res.removed} removed.`)
      load()
    } catch (err) {
      setScanError(errorMessage(err))
    } finally {
      setScanning(false)
    }
  }

  return (
    <>
      <PageHeader title="Library">
        {isAdmin && (
          <button type="button" onClick={() => void scan()} disabled={scanning} className={buttonClass('ghost')}>
            {scanning ? 'Scanning...' : 'Scan library'}
          </button>
        )}
      </PageHeader>
      {scanResult && (
        <p role="status" className="mb-4 text-sm text-emerald-300">
          {scanResult}
        </p>
      )}
      {scanError && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {scanError}
        </p>
      )}
      {error && <LoadError message={error} onRetry={load} />}
      {!error && shows === null && <GridSkeleton />}
      {shows && shows.length === 0 && (
        <EmptyState title="Your library is empty">
          <Link to="/" className="text-accent-text underline underline-offset-4">
            Browse dramas
          </Link>{' '}
          and download episodes to see them here.
        </EmptyState>
      )}
      {shows && shows.length > 0 && (
        <div className={showGridClass}>
          {shows.map((show) => (
            <Link
              key={show.bookId}
              to={`/library/${encodeURIComponent(show.bookId)}`}
              className="group/card block rounded-md outline-none"
            >
              <div className="overflow-hidden rounded-md transition duration-200 group-hover/card:scale-[1.03] group-hover/card:shadow-xl group-hover/card:shadow-black/60 group-focus-visible/card:ring-2 group-focus-visible/card:ring-accent-hi">
                <Poster src={show.cover} name={show.name} aspect="card" />
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-white/90 group-hover/card:text-white">
                {show.name}
              </p>
              <p className="mt-0.5 text-xs text-muted">{show.downloaded} downloaded</p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
