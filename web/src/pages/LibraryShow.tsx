import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, useEvents, type LibraryEpisode, type LibraryShowDetail } from '../api'
import { ErrorPanel, LoadError, Poster, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode, fmtMB } from '../lib/format'
import { useStatus } from '../status'

export function LibraryShow() {
  const isAdmin = useStatus().status?.account?.role === 'admin'
  const { bookId = '' } = useParams()
  const [detail, setDetail] = useState<LibraryShowDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .libraryShow(bookId)
      .then((res) => {
        setDetail(res)
        setError(null)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [bookId])

  useEffect(() => {
    setDetail(null)
    load()
  }, [load])

  useEvents((event) => {
    if (event.type === 'library' && event.bookId === bookId) load()
  })

  async function remove(ep: LibraryEpisode) {
    const label = `${fmtEpisode(ep.episodeIndex)} "${ep.name}"`
    if (!window.confirm(`Delete ${label} from disk? This cannot be undone.`)) return
    setDeletingId(String(ep.id))
    setActionError(null)
    try {
      await api.deleteLibraryEpisode(ep.id)
      load()
    } catch (err) {
      setActionError(`${label}: ${errorMessage(err)}`)
    } finally {
      setDeletingId(null)
    }
  }

  if (error) return <LoadError title="Could not load this show" message={error} onRetry={load} />
  if (!detail) return <p className="py-8 text-sm text-muted">Loading...</p>

  const title = detail.show?.name ?? bookId

  return (
    <div className="space-y-8">
      <Link to="/library" className="inline-flex text-sm text-muted hover:text-white">
        &larr; Library
      </Link>
      <section className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        <div className="w-40 shrink-0 sm:w-56">
          <Poster src={detail.show?.cover} name={title} className="rounded-md shadow-2xl shadow-black/60" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">{detail.episodes.length} downloaded episodes</p>
          {detail.show?.introduction && (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/80">{detail.show.introduction}</p>
          )}
          <Link to={`/show/${encodeURIComponent(bookId)}`} className={`${buttonClass('ghost')} mt-6`}>
            View all episodes
          </Link>
        </div>
      </section>

      {actionError && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {actionError}
        </p>
      )}

      {detail.episodes.length === 0 ? (
        <ErrorPanel title="No episodes" message="No downloaded episodes for this show yet." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {detail.episodes.map((ep) => (
            <li key={String(ep.id)} className="relative flex items-center">
              <Link
                to={`/watch/${encodeURIComponent(bookId)}/${encodeURIComponent(String(ep.id))}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-panel-2 focus-visible:bg-panel-2"
              >
                <span className="w-12 shrink-0 font-mono text-xs text-muted">{fmtEpisode(ep.episodeIndex)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{ep.name}</span>
                {ep.progress?.completed && (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                    Watched
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted">{fmtMB(ep.size)}</span>
                <span className="shrink-0 text-sm font-semibold text-accent-text">Play</span>
              </Link>
              {ep.progress && !ep.progress.completed && ep.progress.duration > 0 && (
                <div
                  role="progressbar"
                  aria-label={`${fmtEpisode(ep.episodeIndex)} watched`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(1, ep.progress.position / ep.progress.duration) * 100)}
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-line"
                >
                  <div
                    className="h-full bg-accent-hi"
                    style={{ width: `${Math.min(100, (ep.progress.position / ep.progress.duration) * 100)}%` }}
                  />
                </div>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void remove(ep)}
                  disabled={deletingId === String(ep.id)}
                  aria-label={`Delete ${fmtEpisode(ep.episodeIndex)} ${ep.name}`}
                  className="mr-3 shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/15 disabled:opacity-40"
                >
                  {deletingId === String(ep.id) ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
