import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type LibraryEpisode, type LibraryShowDetail } from '../api'
import { ErrorPanel, LoadError, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode } from '../lib/format'

const SAVE_INTERVAL_MS = 10_000
const RESUME_MIN_SECONDS = 5
const UP_NEXT_SECONDS = 8

export function Watch() {
  const { bookId = '', downloadId = '' } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<LibraryShowDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api
      .libraryShow(bookId)
      .then(setDetail)
      .catch((err) => setError(errorMessage(err)))
  }, [bookId])

  useEffect(() => {
    setDetail(null)
    load()
  }, [load, downloadId])

  const episodes = useMemo(
    () => [...(detail?.episodes ?? [])].sort((a, b) => a.episodeIndex - b.episodeIndex),
    [detail],
  )
  const index = episodes.findIndex((ep) => String(ep.id) === downloadId)
  const current: LibraryEpisode | undefined = index >= 0 ? episodes[index] : undefined
  const prev = index > 0 ? episodes[index - 1] : undefined
  const next = index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : undefined

  function go(ep: LibraryEpisode) {
    navigate(`/watch/${encodeURIComponent(bookId)}/${encodeURIComponent(String(ep.id))}`)
  }

  useEffect(() => {
    if (fullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => undefined)
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined)
    }
  }, [fullscreen])

  if (error) return <LoadError title="Could not load this episode" message={error} onRetry={load} />
  if (!detail) return <p className="py-8 text-sm text-muted">Loading...</p>

  if (!current) {
    return (
      <div className="space-y-6">
        <ErrorPanel title="Episode not found" message="This episode is not in your library." />
        <Link to={`/library/${encodeURIComponent(bookId)}`} className={buttonClass('ghost')}>
          Back to show
        </Link>
      </div>
    )
  }

  const showName = detail.show?.name ?? bookId

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-black' : 'space-y-5'}>
      <Player
        key={String(current.id)}
        bookId={bookId}
        episode={current}
        next={next}
        onGo={go}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((f) => !f)}
      />

      {!fullscreen && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">
              <Link to={`/library/${encodeURIComponent(bookId)}`} className="hover:text-white">
                {showName}
              </Link>
            </p>
            <h1 className="text-xl font-bold sm:text-2xl">
              <span className="font-mono text-rose-400">{fmtEpisode(current.episodeIndex)}</span> {current.name}
            </h1>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={!prev} onClick={() => prev && go(prev)} className={buttonClass('ghost')}>
              &larr; Previous
            </button>
            <button type="button" disabled={!next} onClick={() => next && go(next)} className={buttonClass()}>
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface PlayerProps {
  bookId: string
  episode: LibraryEpisode
  next: LibraryEpisode | undefined
  onGo: (ep: LibraryEpisode) => void
  fullscreen: boolean
  onToggleFullscreen: () => void
}

function Player({ episode, next, onGo, fullscreen, onToggleFullscreen }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const snapRef = useRef<{ position: number; duration: number } | null>(null)
  const resumedRef = useRef(false)
  const lastSaveRef = useRef(0)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const downloadId = String(episode.id)
  const saved = episode.progress

  const snapshot = useCallback(() => {
    const v = videoRef.current
    if (v && Number.isFinite(v.duration) && v.duration > 0) {
      snapRef.current = { position: v.currentTime, duration: v.duration }
    }
    return snapRef.current
  }, [])

  const persist = useCallback(
    (kind: 'progress' | 'beacon' | 'ended') => {
      if (!resumedRef.current) return
      const snap = snapshot()
      if (!snap) return
      if (kind === 'beacon') {
        api.saveProgressBeacon(downloadId, snap.position, snap.duration)
        return
      }
      lastSaveRef.current = Date.now()
      const position = kind === 'ended' ? snap.duration : snap.position
      api.saveProgress(downloadId, position, snap.duration).catch(() => undefined)
    },
    [downloadId, snapshot],
  )

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') persist('progress')
    }
    function onPageHide() {
      persist('beacon')
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      persist('progress')
    }
  }, [persist])

  const upNext = next !== undefined && !cancelled && remaining !== null && remaining > 0 && remaining <= UP_NEXT_SECONDS

  return (
    <div className={`relative overflow-hidden bg-black ${fullscreen ? 'h-full w-full' : 'rounded-lg shadow-2xl shadow-black/70'}`}>
      <video
        ref={videoRef}
        src={episode.mediaUrl}
        controls
        autoPlay
        playsInline
        preload="auto"
        className={fullscreen ? 'h-full w-full object-contain' : 'aspect-video w-full'}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (saved && !saved.completed && saved.position > RESUME_MIN_SECONDS && saved.position < v.duration) {
            v.currentTime = saved.position
          }
          resumedRef.current = true
          snapshot()
          // Auto-enter fullscreen on play for a Netflix-like experience
          if (!fullscreen) onToggleFullscreen()
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (!Number.isFinite(v.duration)) return
          setRemaining(v.duration - v.currentTime)
          if (!v.paused && Date.now() - lastSaveRef.current >= SAVE_INTERVAL_MS) persist('progress')
        }}
        onPause={() => persist('progress')}
        onEnded={() => {
          persist('ended')
          if (next && !cancelled) onGo(next)
        }}
      >
        Your browser cannot play this video.
      </video>

      {upNext && next && (
        <div
          role="region"
          aria-label="Up next"
          className="absolute right-4 bottom-20 left-4 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/90 p-4 shadow-xl backdrop-blur sm:right-6 sm:bottom-24 sm:left-auto sm:w-96"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-wider text-zinc-400 uppercase">
              Up next in {Math.ceil(remaining ?? 0)}s
            </p>
            <p className="truncate text-sm font-semibold text-white">
              <span className="font-mono text-rose-400">{fmtEpisode(next.episodeIndex)}</span> {next.name}
            </p>
          </div>
          <button type="button" onClick={() => setCancelled(true)} className={buttonClass('ghost')}>
            Cancel
          </button>
          <button type="button" onClick={() => onGo(next)} className={buttonClass()}>
            Play now
          </button>
        </div>
      )}

      {fullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="absolute top-4 right-4 rounded-md bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80"
        >
          Exit fullscreen
        </button>
      )}
    </div>
  )
}
