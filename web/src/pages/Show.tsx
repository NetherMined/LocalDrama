import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, useEvents, type DownloadStatus, type Episode, type ShowDetail } from '../api'
import { useDownloads } from '../downloads'
import { StatusPill } from '../components/StatusPill'
import { Poster, LoadError, buttonClass } from '../components/ui'
import { VideoPlayer } from '../components/VideoPlayer'
import { errorMessage, fmtEpisode } from '../lib/format'

type Display = 'none' | DownloadStatus | 'downloaded'

export function Show() {
  const { bookId = '' } = useParams()
  const { byEpisode } = useDownloads()
  const [detail, setDetail] = useState<ShowDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraryIds, setLibraryIds] = useState<Map<number, number | string>>(() => new Map())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [watching, setWatching] = useState<{ index: number; url: string; hls: boolean } | null>(null)
  const [isFav, setIsFav] = useState(false)
  const [favBusy, setFavBusy] = useState(false)

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
    setNotice(null)
    api
      .show(bookId)
      .then((res) => {
        if (cancelled) return
        setDetail(res)
        if (res.episodes.some((ep) => ep.downloaded)) loadLibrary()
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    api.isFavourite(bookId).then((r) => { if (!cancelled) setIsFav(r.favourite) }).catch(() => undefined)
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

  async function downloadAll() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await api.enqueue(bookId)
      setNotice({
        kind: 'ok',
        text: res.added === 1 ? 'Added 1 episode to downloads.' : `Added ${res.added} episodes to downloads.`,
      })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleFavourite() {
    setFavBusy(true)
    try {
      if (isFav) {
        await api.removeFavourite(bookId)
        setIsFav(false)
      } else {
        await api.addFavourite(bookId)
        setIsFav(true)
      }
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setFavBusy(false)
    }
  }

  async function watchEpisode(index: number) {
    setNotice(null)
    try {
      const res = await fetch(`/api/shows/${encodeURIComponent(bookId)}/stream/${index}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to get stream (${res.status})`)
      }
      const { url, hls } = await res.json()
      if (!url) throw new Error('No stream URL returned')
      setWatching({ index, url, hls: !!hls })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
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

      {watching && (
        <div className="overflow-hidden rounded-lg bg-black shadow-2xl">
          <VideoPlayer
            key={watching.url}
            src={watching.url}
            hls={watching.hls}
            poster={show?.cover}
          />
          <div className="flex items-center justify-between bg-ink px-4 py-2 text-sm">
            <span>Episode {watching.index}</span>
            <button type="button" onClick={() => setWatching(null)} className={buttonClass('ghost')}>
              Close
            </button>
          </div>
        </div>
      )}

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
              onClick={() => void downloadAll()}
              disabled={busy || selectable.length === 0}
              className={buttonClass()}
            >
              {busy ? 'Queuing...' : 'Download all'}
            </button>
            <button
              type="button"
              onClick={() => void toggleFavourite()}
              disabled={favBusy}
              className={buttonClass('ghost')}
            >
              {isFav ? 'Remove from Favourites' : 'Add to Favourites'}
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
        <h2 id="episodes-heading" className="mb-3 text-lg font-semibold">
          Episodes
        </h2>

        {episodes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
            No episodes were returned for this drama.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {episodes.map((ep) => {
              const d = displayOf(ep)
              return (
                <li key={ep.index} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <span className="w-10 shrink-0 font-mono text-xs text-muted">{fmtEpisode(ep.index)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{ep.name || `Episode ${ep.index + 1}`}</span>
                  {d.state !== 'none' && (
                    <StatusPill status={d.state} bytesDone={d.bytesDone} bytesTotal={d.bytesTotal} />
                  )}
                  <button
                    type="button"
                    onClick={() => void watchEpisode(ep.index)}
                    className={buttonClass('ghost')}
                  >
                    Watch
                  </button>
                  {d.state === 'downloaded' && d.id !== undefined && (
                    <Link
                      to={`/watch/${encodeURIComponent(bookId)}/${encodeURIComponent(String(d.id))}`}
                      className={buttonClass('ghost')}
                    >
                      Play local
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
