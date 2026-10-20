import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, useEvents, type DownloadStatus, type Episode, type ShowDetail, type StreamProgress } from '../api'
import { useDownloads } from '../downloads'
import { useStatus } from '../status'
import { PlayerShell, type PlayerEpisode, type PlayerHandle, type PlayerSample, type ResolvedSource } from '../components/PlayerShell'
import { StatusPill } from '../components/StatusPill'
import { CheckIcon, PlayIcon } from '../components/icons'
import { Poster, LoadError, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode, fmtMinutesLeft, isGenericEpisodeName } from '../lib/format'

type Display = 'none' | DownloadStatus | 'downloaded'

interface DisplayInfo {
  state: Display
  bytesDone?: number
  bytesTotal?: number
  id?: number | string
}

const RESUME_MIN_SECONDS = 5

export function Show() {
  const { bookId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const source = searchParams.get('source') || undefined
  const { byEpisode } = useDownloads()
  const isAdmin = useStatus().status?.account?.role === 'admin'
  const [detail, setDetail] = useState<ShowDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraryIds, setLibraryIds] = useState<Map<number, number | string>>(() => new Map())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [isFav, setIsFav] = useState(false)
  const [favBusy, setFavBusy] = useState(false)
  const [progressByEp, setProgressByEp] = useState<Map<number, StreamProgress>>(() => new Map())
  const [progressReady, setProgressReady] = useState(false)
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const playerRef = useRef<PlayerHandle>(null)
  const epParam = searchParams.get('ep')
  const autoOpened = useRef<string | null>(null)
  const currentBook = useRef(bookId)
  currentBook.current = bookId

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
    setProgressByEp(new Map())
    setProgressReady(false)
    setCurrentKey(null)
    api
      .watchProgress(bookId)
      .then((res) => {
        if (!cancelled) setProgressByEp(new Map(res.items.map((p) => [p.episodeIndex, p])))
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProgressReady(true)
      })
    api
      .show(bookId, source)
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
  }, [bookId, source, attempt, loadLibrary])

  useEvents((event) => {
    if (event.type === 'library' && event.bookId === bookId) loadLibrary()
  })

  function displayOf(ep: Episode): DisplayInfo {
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

  // Resumes an unfinished episode from where it was left; a few seconds in is not worth resuming.
  function resumeAt(index: number): number {
    const p = progressByEp.get(index)
    return p && !p.completed && p.position > RESUME_MIN_SECONDS ? p.position : 0
  }

  async function resolveStream(key: string): Promise<ResolvedSource> {
    const index = Number(key)
    const query = source ? `?source=${encodeURIComponent(source)}` : ''
    const res = await fetch(`/api/shows/${encodeURIComponent(bookId)}/stream/${index}${query}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Failed to get stream (${res.status})`)
    }
    const { url, hls } = await res.json()
    if (!url) throw new Error('No stream URL returned')
    return { src: url, hls: !!hls, startAt: resumeAt(index) }
  }

  // Must be called from a click handler (or the deep link effect for inline play) so the player can go fullscreen.
  function playEpisode(index: number, fullscreen = true) {
    const key = String(index)
    setCurrentKey(key)
    playerRef.current?.play(key, { fullscreen })
  }

  function onPlayerChange(key: string) {
    setCurrentKey(key)
    autoOpened.current = `${bookId}:${key}`
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('ep', key)
        return next
      },
      { replace: true },
    )
  }

  function onPlayerClose() {
    if (!searchParams.has('ep')) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('ep')
        return next
      },
      { replace: true },
    )
  }

  const saveWatch = useCallback(
    (index: number, sample: PlayerSample, beacon: boolean) => {
      if (beacon) {
        api.saveWatchBeacon(bookId, index, sample.position, sample.duration, source)
        return
      }
      const forBook = bookId
      api
        .saveWatch(bookId, index, sample.position, sample.duration, source)
        .then((res) => {
          if (currentBook.current !== forBook) return
          setProgressByEp((prev) => new Map(prev).set(index, { episodeIndex: index, ...res.progress }))
        })
        .catch(() => undefined)
    },
    [bookId, source],
  )

  // Deep link from Continue Watching: /show/<id>?ep=<index> plays that episode inline once its progress is known.
  useEffect(() => {
    if (epParam === null || loading || !progressReady || !detail) return
    const key = `${bookId}:${epParam}`
    if (autoOpened.current === key) return
    autoOpened.current = key
    const index = Number(epParam)
    if (!Number.isInteger(index) || !detail.episodes.some((ep) => ep.index === index)) return
    playEpisode(index, false)
    // playEpisode reads the progress map of the render that triggered this effect.
  }, [bookId, epParam, loading, progressReady, detail])

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
  const playerEpisodes: PlayerEpisode[] = episodes.map((ep) => ({
    key: String(ep.index),
    index: ep.index,
    title: isGenericEpisodeName(ep.name) ? '' : ep.name,
  }))

  const progressList = [...progressByEp.values()].sort((a, b) => a.episodeIndex - b.episodeIndex)
  const resumeItem = progressList.filter((p) => !p.completed && p.position > RESUME_MIN_SECONDS).at(-1)
  const doneItem = progressList.filter((p) => p.completed).at(-1)
  const afterDone =
    doneItem && episodes.some((ep) => ep.index === doneItem.episodeIndex + 1) ? doneItem.episodeIndex + 1 : null
  const firstIndex = episodes[0]?.index ?? 0
  let primary: { index: number; label: string }
  if (resumeItem) {
    const left = resumeItem.duration > 0 ? ` · ${fmtMinutesLeft(resumeItem.position, resumeItem.duration)}` : ''
    primary = { index: resumeItem.episodeIndex, label: `Resume ${fmtEpisode(resumeItem.episodeIndex)}${left}` }
  } else if (afterDone !== null) {
    primary = { index: afterDone, label: `Play ${fmtEpisode(afterDone)}` }
  } else {
    primary = { index: firstIndex, label: `Play ${fmtEpisode(firstIndex)}` }
  }

  const meta = [
    ...(show?.tags ?? []).slice(0, 4),
    `${episodes.length || show?.episodeCount || 0} episodes`,
    show?.sourceName,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-8">
      <BackLink />

      <PlayerShell
        key={`${bookId}:${source ?? ''}`}
        ref={playerRef}
        episodes={playerEpisodes}
        resolve={resolveStream}
        onSave={(key, sample, beacon) => saveWatch(Number(key), sample, beacon)}
        onChange={onPlayerChange}
        onClose={onPlayerClose}
        showTitle={title}
        poster={show?.cover}
      />

      <section aria-label="Drama details" className="relative isolate overflow-hidden rounded-xl border border-line bg-panel">
        {show?.cover && (
          <img
            src={show.cover}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover object-top opacity-40 blur-2xl"
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/80 to-black/50" />
        <div className="flex flex-col gap-6 p-4 sm:p-6 md:flex-row md:gap-8 lg:p-10">
          <div className="hidden w-48 shrink-0 md:block lg:w-56">
            <Poster src={show?.cover} name={title} className="rounded-md shadow-2xl shadow-black/60" />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <h1 className="text-3xl leading-tight font-black tracking-tight break-words sm:text-4xl md:text-5xl">
              {title}
            </h1>
            {meta && <p className="text-sm font-medium text-muted">{meta}</p>}
            {!show && (
              <p className="text-sm text-amber-300">Details are not cached for this drama. Episodes are shown below.</p>
            )}
            {show?.introduction && (
              <div className="max-w-3xl">
                <p
                  className={`text-sm leading-relaxed text-white/80 sm:text-base ${expanded ? '' : 'line-clamp-3'}`}
                >
                  {show.introduction}
                </p>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 text-sm font-semibold text-rose-300 hover:text-rose-200"
                >
                  {expanded ? 'Less' : 'More'}
                </button>
              </div>
            )}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => playEpisode(primary.index)}
                disabled={episodes.length === 0}
                className={`${buttonClass()} w-full sm:w-auto`}
              >
                <PlayIcon className="h-4 w-4" />
                {primary.label}
              </button>
              <button
                type="button"
                onClick={() => void toggleFavourite()}
                disabled={favBusy}
                className={`${buttonClass('ghost')} w-full sm:w-auto`}
              >
                {isFav ? 'Remove from Favourites' : 'Add to Favourites'}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void downloadAll()}
                  disabled={busy || selectable.length === 0}
                  className={`${buttonClass('ghost')} w-full sm:w-auto`}
                >
                  {busy ? 'Queuing...' : 'Download all'}
                </button>
              )}
            </div>
            {notice && (
              <p role="status" className={`text-sm ${notice.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
                {notice.text}
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="episodes-heading">
        <h2 id="episodes-heading" className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
          Episodes
          <span className="text-sm font-normal text-muted">{episodes.length}</span>
        </h2>

        {episodes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
            No episodes were returned for this drama.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {episodes.map((ep) => (
              <EpisodeTile
                key={ep.index}
                bookId={bookId}
                ep={ep}
                display={displayOf(ep)}
                progress={progressByEp.get(ep.index)}
                current={currentKey === String(ep.index)}
                onPlay={() => playEpisode(ep.index)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function EpisodeTile({
  bookId,
  ep,
  display,
  progress,
  current,
  onPlay,
}: {
  bookId: string
  ep: Episode
  display: DisplayInfo
  progress: StreamProgress | undefined
  current: boolean
  onPlay: () => void
}) {
  const percent =
    progress && progress.duration > 0 ? Math.min(100, Math.round((progress.position / progress.duration) * 100)) : 0
  const showBar = !!progress && !progress.completed && percent > 0
  const title = isGenericEpisodeName(ep.name) ? '' : ep.name
  const localHref =
    display.state === 'downloaded' && display.id !== undefined
      ? `/watch/${encodeURIComponent(bookId)}/${encodeURIComponent(String(display.id))}`
      : null

  return (
    <li className="relative">
      <button
        type="button"
        onClick={onPlay}
        aria-current={current || undefined}
        className={`flex min-h-[44px] w-full flex-col items-start gap-1.5 rounded-lg border bg-panel p-3 text-left transition hover:bg-panel-2 ${
          current ? 'border-accent-hi' : 'border-line'
        }`}
      >
        <span className="font-mono text-xs text-muted">{fmtEpisode(ep.index)}</span>
        {title && <span className="line-clamp-2 text-sm leading-snug font-medium">{title}</span>}
        <span className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
          {progress?.completed && (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
              <CheckIcon className="h-3.5 w-3.5" />
              Watched
            </span>
          )}
          {display.state !== 'none' && display.state !== 'downloaded' && (
            <StatusPill status={display.state} bytesDone={display.bytesDone} bytesTotal={display.bytesTotal} />
          )}
        </span>
        {showBar && (
          <span
            role="progressbar"
            aria-label={`${fmtEpisode(ep.index)} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="block h-1 w-full overflow-hidden rounded bg-white/10"
          >
            <span className="block h-full bg-accent-hi" style={{ width: `${percent}%` }} />
          </span>
        )}
      </button>
      {display.state === 'downloaded' &&
        (localHref ? (
          <Link
            to={localHref}
            className="absolute top-2 right-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-300 hover:bg-emerald-500/25"
          >
            Downloaded
          </Link>
        ) : (
          <span className="absolute top-2 right-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-300">
            Downloaded
          </span>
        ))}
    </li>
  )
}

function BackLink() {
  return (
    <Link to="/browse" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-white">
      &larr; Back to browse
    </Link>
  )
}
