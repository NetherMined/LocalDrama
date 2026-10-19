import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, useEvents, type DownloadStatus, type Episode, type ShowDetail } from '../api'
import { useDownloads } from '../downloads'
import { StatusPill } from '../components/StatusPill'
import { Poster, LoadError, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode } from '../lib/format'

type Display = 'none' | DownloadStatus | 'downloaded'

export function Show() {
  const { bookId = '' } = useParams()
  const { byEpisode } = useDownloads()
  const [detail, setDetail] = useState<ShowDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraryIds, setLibraryIds] = useState<Map<number, number | string>>(() => new Map())
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  const loadLibrary = useCallback(() => {
    api
      .libraryShow(bookId)
      .then((res) => setLibraryIds(new Map(res.episodes.map((e) => [e.episodeIndex, e.id]))))
      .catch(() => setLibraryIds(new Map()))
  }, [bookId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelected(new Set())
    setNotice(null)
    api
      .show(bookId)
      .then((res) => {
        if (!cancelled) setDetail(res)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    loadLibrary()
    return () => {
      cancelled = true
    }
  }, [bookId, attempt, loadLibrary])

  useEvents((event) => {
    if (event.type === 'library' && event.bookId === bookId) loadLibrary()
  })

  function displayOf(ep: Episode): { state: Display; bytesDone?: number; bytesTotal?: number; id?: number | string } {
    const live = byEpisode(bookId, ep.index)
    if (libraryIds.has(ep.index) || live?.status === 'completed') {
      return { state: 'downloaded', id: libraryIds.get(ep.index) }
    }
    if (live) {
      return { state: live.status, bytesDone: live.bytesDone, bytesTotal: live.bytesTotal }
    }
    if (ep.downloaded) return { state: 'downloaded', id: libraryIds.get(ep.index) }
    return { state: 'none' }
  }

  const episodes = detail?.episodes ?? []
  const selectable = episodes.filter((ep) => {
    const s = displayOf(ep).state
    return s === 'none' || s === 'failed'
  })
  const allSelected = selectable.length > 0 && selectable.every((ep) => selected.has(ep.index))
  const someSelected = selected.size > 0 && !allSelected

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((ep) => ep.index)))
  }

  async function enqueue(episodes?: number[]) {
    setBusy(true)
    setNotice(null)
    try {
      const res = await api.enqueue(bookId, episodes)
      setNotice({
        kind: 'ok',
        text: res.added === 1 ? 'Added 1 episode to downloads.' : `Added ${res.added} episodes to downloads.`,
      })
      setSelected(new Set())
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse" aria-busy="true" aria-label="Loading drama">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="aspect-[3/4] w-40 rounded-md bg-panel-2 sm:w-56" />
          <div className="flex-1 space-y-3">
            <div className="h-8 w-2/3 rounded bg-panel-2" />
            <div className="h-4 w-1/3 rounded bg-panel-2" />
            <div className="h-20 w-full rounded bg-panel-2" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadError title="Could not load this drama" message={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    )
  }

  const show = detail?.show ?? null
  const title = show?.name ?? bookId

  return (
    <div className="space-y-8">
      <BackLink />

      <section className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        <div className="w-40 shrink-0 sm:w-56">
          <Poster src={show?.cover} name={title} className="rounded-md shadow-2xl shadow-black/60" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          {!show && (
            <p className="mt-2 text-sm text-amber-300">Details are not cached for this drama. Episodes are shown below.</p>
          )}
          {show?.tags && show.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
              {show.tags.map((tag) => (
                <li key={tag} className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-white/80">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {show && (
              <div>
                <dt className="inline text-muted">Plays </dt>
                <dd className="inline font-semibold">{show.playCount.toLocaleString()}</dd>
              </div>
            )}
            <div>
              <dt className="inline text-muted">Episodes </dt>
              <dd className="inline font-semibold">{episodes.length || show?.episodeCount || 0}</dd>
            </div>
          </dl>
          {show?.introduction && (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/80">{show.introduction}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void enqueue()}
              disabled={busy || selectable.length === 0}
              className={buttonClass()}
            >
              Download all
            </button>
            <button
              type="button"
              onClick={() => void enqueue([...selected].sort((a, b) => a - b))}
              disabled={busy || selected.size === 0}
              className={buttonClass('ghost')}
            >
              Download selected ({selected.size})
            </button>
          </div>
          {notice && (
            <p role="status" className={`mt-3 text-sm ${notice.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
              {notice.text}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="episodes-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="episodes-heading" className="text-lg font-semibold">
            Episodes
          </h2>
          {selectable.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={toggleAll}
                className="h-4 w-4 accent-rose-500"
              />
              Select all
            </label>
          )}
        </div>

        {episodes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
            No episodes were returned for this drama.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {episodes.map((ep) => {
              const d = displayOf(ep)
              const canSelect = d.state === 'none' || d.state === 'failed'
              return (
                <li key={ep.index} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <input
                    type="checkbox"
                    disabled={!canSelect}
                    checked={selected.has(ep.index)}
                    onChange={() => toggle(ep.index)}
                    aria-label={`Select episode ${ep.index + 1}`}
                    className="h-4 w-4 shrink-0 accent-rose-500 disabled:opacity-30"
                  />
                  <span className="w-10 shrink-0 font-mono text-xs text-muted">{fmtEpisode(ep.index)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{ep.name || `Episode ${ep.index + 1}`}</span>
                  {d.state !== 'none' && (
                    <StatusPill status={d.state} bytesDone={d.bytesDone} bytesTotal={d.bytesTotal} />
                  )}
                  {d.state === 'downloaded' && d.id !== undefined && (
                    <Link
                      to={`/watch/${encodeURIComponent(bookId)}/${encodeURIComponent(String(d.id))}`}
                      className={buttonClass('ghost')}
                    >
                      Play
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/browse" className="inline-flex text-sm text-muted hover:text-white">
      &larr; Back to browse
    </Link>
  )
}
