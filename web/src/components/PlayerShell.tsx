import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { api, type ClientPlaybackEvent } from '../api'
import { useHlsSource, type HlsSource } from '../hooks/useHlsSource'
import { errorMessage, fmtEpisode } from '../lib/format'
import { isIpadDesktop } from '../lib/userAgent'
import { CloseIcon, ExitFullscreenIcon, FullscreenIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from './icons'
import { buttonClass } from './ui'

export interface PlayerSample {
  position: number
  duration: number
}

export interface PlayerEpisode {
  key: string
  /** Zero-based episode index, as used by the stream API. */
  index: number
  /** Empty when the episode has no real name; only the label is shown then. */
  title: string
}

export interface ResolvedSource {
  src: string
  hls: boolean
  startAt: number
}

export interface PlayerHandle {
  /** Starts an episode. Call it synchronously from a click so fullscreen is allowed. */
  play: (key: string, options?: { fullscreen?: boolean }) => void
  enterFullscreen: () => void
}

export interface PlayerShellProps {
  ref?: Ref<PlayerHandle>
  episodes: PlayerEpisode[]
  /** When it differs from the episode playing, that episode loads inline. */
  currentKey?: string | null
  resolve: (key: string) => Promise<ResolvedSource>
  onSave: (key: string, sample: PlayerSample, beacon: boolean) => void
  /** Called after the shell switches episode itself (next, autoplay, replay). */
  onChange?: (key: string) => void
  onClose?: () => void
  showTitle: string
  poster?: string
  /** Portrait 9:16 frame capped at 70vh and centred, for vertical drama posters. */
  portrait?: boolean
  /** Context for playback diagnostics sent to the server log. */
  telemetry?: { platform?: string; bookId: string }
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
type TapHint = 'unmute' | 'play' | null
type Stuck = 'start' | 'stall' | null
interface Snapshot {
  key: string
  position: number
  duration: number
}
type VideoWithWebkit = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitSupportsFullscreen?: boolean
}

const SAVE_INTERVAL_MS = 10_000
const UP_NEXT_SECONDS = 10
const UNKNOWN_END_COUNTDOWN_SECONDS = 5
const PREFETCH_SECONDS = 15
const CHROME_HIDE_MS = 3_000
const SEEK_SECONDS = 10
const WATCHDOG_START_MS = 15_000
const WATCHDOG_STALL_MS = 20_000
const AUTOPLAY_STORAGE_KEY = 'dramaus.autoplay'

function readAutoplay(): boolean {
  try {
    return window.localStorage.getItem(AUTOPLAY_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeAutoplay(on: boolean) {
  try {
    window.localStorage.setItem(AUTOPLAY_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage is blocked (private windows); the setting then lasts for this page only.
  }
}

type OrientationApi = { lock?: (orientation: 'landscape') => Promise<void>; unlock?: () => void }

function orientationApi(): OrientationApi | undefined {
  // TypeScript's DOM lib omits lock(); browsers without it simply skip the lock.
  return (screen as unknown as { orientation?: OrientationApi }).orientation
}

function lockLandscape() {
  try {
    void orientationApi()?.lock?.('landscape')?.catch(() => undefined)
  } catch {
    // Orientation lock is not supported here.
  }
}

// iOS and iPadOS only offer the native video fullscreen, and only once the video has a source.
function usesNativeVideoFullscreen(video: VideoWithWebkit): boolean {
  if (typeof video.webkitEnterFullscreen !== 'function') return false
  return !document.fullscreenEnabled || isIpadDesktop()
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

function hostOf(url: string | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url, window.location.href).hostname
  } catch {
    return undefined
  }
}

function unlockOrientation() {
  try {
    orientationApi()?.unlock?.()
  } catch {
    // Orientation lock is not supported here.
  }
}

function findNeighbours(list: PlayerEpisode[], key: string | null) {
  const i = key === null ? -1 : list.findIndex((ep) => ep.key === key)
  return {
    prev: i > 0 ? list[i - 1] : undefined,
    next: i >= 0 && i < list.length - 1 ? list[i + 1] : undefined,
  }
}

function clearTimer(id: number | null) {
  if (id !== null) window.clearTimeout(id)
}

export function PlayerShell({
  ref,
  episodes,
  currentKey = null,
  resolve,
  onSave,
  onChange,
  onClose,
  showTitle,
  poster,
  portrait = false,
  telemetry,
}: PlayerShellProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [source, setSource] = useState<HlsSource | null>(null)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [tapHint, setTapHint] = useState<TapHint>(null)
  const [stuck, setStuck] = useState<Stuck>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [paused, setPaused] = useState(true)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [finished, setFinished] = useState(false)
  const [autoplay, setAutoplay] = useState(readAutoplay)

  const activeKeyRef = useRef<string | null>(null)
  const readyRef = useRef(false)
  const pendingPlayRef = useRef(false)
  const startAtRef = useRef(0)
  const loadTokenRef = useRef(0)
  const snapRef = useRef<Snapshot | null>(null)
  const prefetchRef = useRef<{ key: string; promise: Promise<ResolvedSource> } | null>(null)
  const autoplayRef = useRef(autoplay)
  const cancelledRef = useRef(false)
  const hideTimerRef = useRef<number | null>(null)
  const lastSaveRef = useRef(0)
  const srcRef = useRef<string | null>(null)
  const playedRef = useRef(false)
  const nativeFsOnPlayRef = useRef(false)
  const startWatchdogRef = useRef<number | null>(null)
  const stallWatchdogRef = useRef<number | null>(null)
  const latest = useRef({ episodes, resolve, onSave, onChange, onClose, telemetry })
  const switchRef = useRef<(key: string) => void>(() => undefined)

  useEffect(() => {
    latest.current = { episodes, resolve, onSave, onChange, onClose, telemetry }
    switchRef.current = switchTo
  })

  // Sends a playback problem to the server log. Never throws; the player keeps working without it.
  function report(event: ClientPlaybackEvent, extra: { code?: number; message?: string; details?: string } = {}) {
    const { telemetry: context, episodes: list } = latest.current
    const key = activeKeyRef.current
    const episode = key ? list.find((ep) => ep.key === key) : undefined
    api.clientLog({
      event,
      platform: context?.platform,
      bookId: context?.bookId,
      episode: episode?.index,
      src: hostOf(srcRef.current),
      ...extra,
    })
  }

  function reportFullscreenFailure(err: unknown) {
    report('fullscreen_failed', { message: describeError(err) })
  }

  function reportPlayRejected(err: unknown) {
    report('play_rejected', { message: describeError(err) })
  }

  function clearWatchdogs() {
    clearTimer(startWatchdogRef.current)
    clearTimer(stallWatchdogRef.current)
    startWatchdogRef.current = null
    stallWatchdogRef.current = null
  }

  function armStartWatchdog(token: number) {
    startWatchdogRef.current = window.setTimeout(() => {
      startWatchdogRef.current = null
      if (token !== loadTokenRef.current) return
      const video = videoRef.current
      // A ready video that is paused is waiting on a tap or a button, not stuck.
      if (video && readyRef.current && video.paused) return
      setStuck('start')
      report('watchdog_timeout')
    }, WATCHDOG_START_MS)
  }

  function armStallWatchdog() {
    if (!playedRef.current || stallWatchdogRef.current !== null) return
    stallWatchdogRef.current = window.setTimeout(() => {
      stallWatchdogRef.current = null
      const video = videoRef.current
      if (!video || video.paused || !readyRef.current) return
      setStuck('stall')
      report('stall_timeout')
    }, WATCHDOG_STALL_MS)
  }

  // Reads the playhead when the video is live; otherwise falls back to the last sample for the active episode.
  // The unmount path relies on the fallback because React may have detached the element by then.
  function capture(video: HTMLVideoElement | null): Snapshot | null {
    const key = activeKeyRef.current
    if (video && key && readyRef.current) {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      if (duration > 0 && video.currentTime > 0) {
        snapRef.current = { key, position: video.currentTime, duration }
      }
    }
    return snapRef.current
  }

  function flush(beacon: boolean) {
    const snap = capture(videoRef.current)
    if (snap) latest.current.onSave(snap.key, { position: snap.position, duration: snap.duration }, beacon)
  }

  function tryPlay(video: HTMLVideoElement) {
    video.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (!video.muted) {
        // Autoplay with sound was refused: start muted and ask for a tap to unmute.
        video.muted = true
        video.play().then(
          () => setTapHint('unmute'),
          (retryErr: unknown) => {
            setTapHint('play')
            reportPlayRejected(retryErr)
          },
        )
        return
      }
      setTapHint('play')
      reportPlayRejected(err)
    })
  }

  function enterFullscreen() {
    const root = rootRef.current
    const video = videoRef.current as VideoWithWebkit | null
    try {
      if (video && usesNativeVideoFullscreen(video)) {
        video.webkitEnterFullscreen?.()
      } else if (root) {
        const request = root.requestFullscreen()
        void request?.catch?.(reportFullscreenFailure)
      }
    } catch (err) {
      reportFullscreenFailure(err)
    }
    lockLandscape()
  }

  function exitFullscreen() {
    try {
      if (document.fullscreenElement) void document.exitFullscreen()?.catch?.(() => undefined)
    } catch {
      // Already left fullscreen, or the browser refused; playback is unaffected.
    }
    unlockOrientation()
  }

  // Native fullscreen on iOS is only allowed while playback runs, so it is requested from the first playing event.
  function enterNativeOnPlay(video: VideoWithWebkit) {
    if (!video.webkitSupportsFullscreen) return
    try {
      video.webkitEnterFullscreen?.()
    } catch (err) {
      reportFullscreenFailure(err)
    }
  }

  function startKey(key: string, options: { fresh?: boolean; resumeFrom?: number } = {}) {
    const video = videoRef.current
    if (!options.fresh && key === activeKeyRef.current && readyRef.current && video) {
      if (video.ended) video.currentTime = 0
      setFinished(false)
      tryPlay(video)
      return
    }

    // Save the episode being left while its source is still attached.
    flush(false)
    snapRef.current = null
    readyRef.current = false
    pendingPlayRef.current = true
    startAtRef.current = 0
    cancelledRef.current = false
    activeKeyRef.current = key
    const token = ++loadTokenRef.current
    clearWatchdogs()
    playedRef.current = false
    setStuck(null)
    setActiveKey(key)
    setSource(null)
    setStatus('loading')
    setErrorText(null)
    setTapHint(null)
    setRemaining(null)
    setCountdown(null)
    setCancelled(false)
    setFinished(false)
    setPaused(true)
    setChromeVisible(true)

    const prefetched = !options.fresh && prefetchRef.current?.key === key ? prefetchRef.current.promise : null
    prefetchRef.current = null
    const pending = prefetched ?? (async () => latest.current.resolve(key))()
    pending.then(
      (resolved) => {
        if (token !== loadTokenRef.current) return
        startAtRef.current = options.resumeFrom ?? resolved.startAt
        srcRef.current = resolved.src
        setSource({ src: resolved.src, hls: resolved.hls })
      },
      (err: unknown) => {
        if (token !== loadTokenRef.current) return
        pendingPlayRef.current = false
        clearWatchdogs()
        setStuck(null)
        setStatus('error')
        setErrorText(errorMessage(err))
        report('stream_url_failed', { message: describeError(err) })
      },
    )
    armStartWatchdog(token)
  }

  function playKey(key: string, fullscreenNow: boolean) {
    const root = rootRef.current
    // The root may still be hidden from the idle state; it has to be rendered before requestFullscreen runs.
    if (root) root.hidden = false
    const video = videoRef.current as VideoWithWebkit | null
    const deferNative = fullscreenNow && video !== null && usesNativeVideoFullscreen(video)
    nativeFsOnPlayRef.current = deferNative
    try {
      if (fullscreenNow && !deferNative) enterFullscreen()
    } finally {
      startKey(key)
    }
    root?.focus({ preventScroll: true })
  }

  function retryStuck() {
    const key = activeKeyRef.current
    if (!key) return
    const video = videoRef.current
    // A stalled video reloads its stream and resumes where it stopped.
    const resumeFrom = stuck === 'stall' && video && readyRef.current && video.currentTime > 0 ? video.currentTime : undefined
    startKey(key, { fresh: true, resumeFrom })
  }

  function switchTo(key: string) {
    startKey(key)
    latest.current.onChange?.(key)
  }

  function close() {
    flush(false)
    snapRef.current = null
    readyRef.current = false
    pendingPlayRef.current = false
    activeKeyRef.current = null
    loadTokenRef.current += 1
    videoRef.current?.pause()
    exitFullscreen()
    clearTimer(hideTimerRef.current)
    hideTimerRef.current = null
    clearWatchdogs()
    setStuck(null)
    setActiveKey(null)
    setSource(null)
    setStatus('idle')
    setTapHint(null)
    setFinished(false)
    setCountdown(null)
    latest.current.onClose?.()
  }

  function revealChrome() {
    setChromeVisible(true)
    clearTimer(hideTimerRef.current)
    hideTimerRef.current = null
    const video = videoRef.current
    if (video && !video.paused) {
      hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_HIDE_MS)
    }
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video || !readyRef.current) return
    if (video.paused) tryPlay(video)
    else video.pause()
  }

  function seekBy(delta: number) {
    const video = videoRef.current
    if (!video || !readyRef.current) return
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), duration)
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) exitFullscreen()
    else enterFullscreen()
  }

  function toggleAutoplay() {
    const next = !autoplayRef.current
    autoplayRef.current = next
    writeAutoplay(next)
    setAutoplay(next)
  }

  function cancelUpNext() {
    cancelledRef.current = true
    setCancelled(true)
    setCountdown(null)
  }

  function onTap() {
    const video = videoRef.current
    if (!video) return
    if (tapHint === 'unmute') video.muted = false
    setTapHint(null)
    tryPlay(video)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!activeKeyRef.current) return
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
    const nav = findNeighbours(latest.current.episodes, activeKeyRef.current)
    switch (event.key) {
      case ' ':
        // Space on a focused button is that button's click.
        if (target.tagName === 'BUTTON') return
        togglePlay()
        break
      case 'k':
      case 'K':
        togglePlay()
        break
      case 'f':
      case 'F':
        toggleFullscreen()
        break
      case 'n':
      case 'N':
        if (nav.next) switchTo(nav.next.key)
        break
      case 'p':
      case 'P':
        if (nav.prev) switchTo(nav.prev.key)
        break
      case 'ArrowLeft':
        seekBy(-SEEK_SECONDS)
        break
      case 'ArrowRight':
        seekBy(SEEK_SECONDS)
        break
      default:
        return
    }
    event.preventDefault()
    revealChrome()
  }

  useImperativeHandle(
    ref,
    () => ({
      play: (key, options) => playKey(key, options?.fullscreen ?? true),
      enterFullscreen,
    }),
    [],
  )

  useHlsSource(videoRef, source, (message, details) => {
    clearWatchdogs()
    setStuck(null)
    setStatus('error')
    setErrorText(message)
    report('hls_fatal', { message, details })
  })

  useEffect(() => {
    if (!currentKey || currentKey === activeKeyRef.current) return
    playKey(currentKey, false)
  }, [currentKey])

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      const { next } = findNeighbours(latest.current.episodes, activeKeyRef.current)
      if (next) switchRef.current(next.key)
      return
    }
    const id = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [countdown])

  useEffect(() => {
    const video = videoRef.current
    const root = rootRef.current
    if (!video || !root) return

    const duration = () => (Number.isFinite(video.duration) ? video.duration : 0)

    const onLoadedMetadata = () => {
      readyRef.current = true
      const startAt = startAtRef.current
      if (startAt > 0 && startAt < duration()) video.currentTime = startAt
      setStatus('ready')
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false
        tryPlay(video)
      }
    }
    const onPlay = () => {
      setPaused(false)
      revealChrome()
    }
    const onPlaying = () => {
      lastSaveRef.current = Date.now()
      playedRef.current = true
      clearWatchdogs()
      setStuck(null)
      if (nativeFsOnPlayRef.current) {
        nativeFsOnPlayRef.current = false
        enterNativeOnPlay(video)
      }
    }
    const onWaiting = () => armStallWatchdog()
    const onPause = () => {
      setPaused(true)
      setChromeVisible(true)
      clearTimer(hideTimerRef.current)
      hideTimerRef.current = null
      flush(false)
    }
    const onTimeUpdate = () => {
      const key = activeKeyRef.current
      capture(video)
      if (!key || !readyRef.current) return
      const d = duration()
      setRemaining(d > 0 ? d - video.currentTime : null)
      if (!video.paused && Date.now() - lastSaveRef.current >= SAVE_INTERVAL_MS) {
        lastSaveRef.current = Date.now()
        flush(false)
      }
      const { next } = findNeighbours(latest.current.episodes, key)
      if (
        next &&
        autoplayRef.current &&
        d > 0 &&
        d - video.currentTime <= PREFETCH_SECONDS &&
        prefetchRef.current?.key !== next.key
      ) {
        const promise = (async () => latest.current.resolve(next.key))()
        promise.catch(() => undefined)
        prefetchRef.current = { key: next.key, promise }
      }
    }
    const onEnded = () => {
      setPaused(true)
      setChromeVisible(true)
      const key = activeKeyRef.current
      const d = duration()
      if (key && readyRef.current && d > 0) latest.current.onSave(key, { position: d, duration: d }, false)
      const { next } = findNeighbours(latest.current.episodes, key)
      if (!next) {
        setFinished(true)
        return
      }
      if (!autoplayRef.current || cancelledRef.current) return
      if (d > 0) switchRef.current(next.key)
      else setCountdown(UNKNOWN_END_COUNTDOWN_SECONDS)
    }
    const onError = () => {
      if (!activeKeyRef.current || !video.error) return
      if (video.error.code === MediaError.MEDIA_ERR_ABORTED) return
      readyRef.current = false
      clearWatchdogs()
      setStuck(null)
      setStatus('error')
      setErrorText('The video could not be played.')
      report('media_error', { code: video.error.code, message: video.error.message })
    }
    const onVolumeChange = () => {
      if (!video.muted) setTapHint((hint) => (hint === 'unmute' ? null : hint))
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(false)
    }
    const onPageHide = () => flush(true)
    const onFullscreenChange = () => {
      const inFs = document.fullscreenElement === root
      setFullscreen(inFs)
      if (inFs) lockLandscape()
      else unlockOrientation()
    }
    const onWebkitBegin = () => setFullscreen(true)
    const onWebkitEnd = () => setFullscreen(false)

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onWaiting)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('webkitbeginfullscreen', onWebkitBegin)
    video.addEventListener('webkitendfullscreen', onWebkitEnd)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onWaiting)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      video.removeEventListener('volumechange', onVolumeChange)
      video.removeEventListener('webkitbeginfullscreen', onWebkitBegin)
      video.removeEventListener('webkitendfullscreen', onWebkitEnd)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('pagehide', onPageHide)
      flush(true)
      clearTimer(hideTimerRef.current)
      hideTimerRef.current = null
      clearWatchdogs()
    }
  }, [])

  const nav = findNeighbours(episodes, activeKey)
  const { prev, next } = nav
  const current = episodes.find((ep) => ep.key === activeKey)
  const chromeShown = chromeVisible || paused || status !== 'ready'
  const upNextVisible =
    next !== undefined &&
    autoplay &&
    !cancelled &&
    !finished &&
    (countdown !== null || (remaining !== null && remaining > 0 && remaining <= UP_NEXT_SECONDS))
  const ringValue = countdown ?? remaining ?? 0
  const ringTotal = countdown !== null ? UNKNOWN_END_COUNTDOWN_SECONDS : UP_NEXT_SECONDS
  const showPlayFullscreen =
    activeKey !== null && !fullscreen && paused && status === 'ready' && !finished && tapHint === null && !upNextVisible
  const first = episodes[0]

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      hidden={activeKey === null}
      onPointerMove={revealChrome}
      onPointerDown={revealChrome}
      onKeyDown={onKeyDown}
      className={
        fullscreen
          ? 'relative h-full w-full bg-black outline-none'
          : portrait
            ? 'relative mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-[calc(70vh*9/16)] short:max-h-[calc(100svh-5rem)] short:max-w-[calc((100svh-5rem)*9/16)] overflow-hidden rounded-lg bg-black shadow-2xl shadow-black/70 outline-none'
            : 'relative aspect-video w-full overflow-hidden rounded-lg bg-black shadow-2xl shadow-black/70 outline-none'
      }
    >
      <video
        ref={videoRef}
        controls
        playsInline
        poster={poster}
        aria-label={current ? `${showTitle}, ${fmtEpisode(current.index)}` : showTitle}
        className="absolute inset-0 h-full w-full object-contain"
      />

      <div
        className={`absolute inset-x-0 top-0 z-10 transition-opacity duration-300 ${
          chromeShown ? 'opacity-100' : 'pointer-events-none invisible opacity-0'
        }`}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
        <div className="relative flex items-center gap-1.5 p-2 sm:gap-2 sm:p-4">
          <ChromeButton label="Close player" onClick={close}>
            <CloseIcon className="h-5 w-5" />
          </ChromeButton>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-xs text-white/70 sm:text-sm">{showTitle}</p>
            {current && (
              <p className="truncate text-sm font-semibold text-white sm:text-base">
                <span className="font-mono text-accent-text">{fmtEpisode(current.index)}</span>
                {current.title ? ` · ${current.title}` : ''}
              </p>
            )}
          </div>
          <ChromeButton
            label="Previous episode"
            disabled={!prev}
            onClick={() => {
              if (prev) switchTo(prev.key)
            }}
          >
            <SkipBackIcon className="h-5 w-5" />
          </ChromeButton>
          <ChromeButton
            label="Next episode"
            disabled={!next}
            onClick={() => {
              if (next) switchTo(next.key)
            }}
          >
            <SkipForwardIcon className="h-5 w-5" />
          </ChromeButton>
          <button
            type="button"
            aria-pressed={autoplay}
            aria-label={`Autoplay next episode ${autoplay ? 'on' : 'off'}`}
            title="Autoplay next episode"
            onClick={toggleAutoplay}
            className={`inline-flex h-11 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold backdrop-blur transition sm:h-10 sm:px-3 ${
              autoplay ? 'bg-white text-black' : 'bg-black/50 text-white hover:bg-black/70'
            }`}
          >
            Auto {autoplay ? 'on' : 'off'}
          </button>
          <ChromeButton label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleFullscreen}>
            {fullscreen ? <ExitFullscreenIcon className="h-5 w-5" /> : <FullscreenIcon className="h-5 w-5" />}
          </ChromeButton>
        </div>
      </div>

      {status === 'loading' && activeKey !== null && stuck === null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            role="status"
            aria-label="Loading episode"
            className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-accent-hi"
          />
        </div>
      )}

      {status === 'error' && activeKey !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
          <div role="alert" className="w-full max-w-sm rounded-lg border border-accent/40 bg-panel p-5 text-center">
            <p className="font-semibold text-accent-text">Could not play this episode</p>
            {errorText && <p className="mt-1 text-sm break-words text-white/80">{errorText}</p>}
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={() => startKey(activeKey, { fresh: true })} className={buttonClass()}>
                Retry
              </button>
              {next && (
                <button type="button" onClick={() => switchTo(next.key)} className={buttonClass('ghost')}>
                  Next episode
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {stuck !== null && status !== 'error' && activeKey !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
          <div role="alert" className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-5 text-center">
            <p className="font-semibold">Taking longer than usual</p>
            <p className="mt-1 text-sm text-muted">
              {stuck === 'stall' ? 'The video stopped loading.' : 'This episode has not started yet.'}
            </p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={retryStuck} className={buttonClass()}>
                Retry
              </button>
              {next && (
                <button type="button" onClick={() => switchTo(next.key)} className={buttonClass('ghost')}>
                  Next episode
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tapHint !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <button
            type="button"
            onClick={onTap}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black"
          >
            <PlayIcon className="h-4 w-4" />
            {tapHint === 'unmute' ? 'Tap to unmute' : 'Tap to play'}
          </button>
        </div>
      )}

      {activeKey !== null && showPlayFullscreen && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={() => playKey(activeKey, true)}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/90 px-6 py-3 text-sm font-bold text-black shadow-xl hover:bg-white"
          >
            <PlayIcon className="h-4 w-4" />
            Play fullscreen
          </button>
        </div>
      )}

      {finished && activeKey !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
          <div role="region" aria-label="Series finished" className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-6 text-center">
            <p className="text-lg font-bold">Series finished</p>
            <p className="mt-1 text-sm break-words text-muted">{showTitle}</p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button type="button" onClick={close} className={buttonClass('ghost')}>
                Back to series
              </button>
              {first && (
                <button type="button" onClick={() => switchTo(first.key)} className={buttonClass()}>
                  Replay {fmtEpisode(first.index)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {upNextVisible && next && (
        <div
          role="region"
          aria-label="Up next"
          className="absolute right-3 bottom-16 left-3 z-10 flex items-center gap-3 rounded-lg border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur sm:right-5 sm:bottom-20 sm:left-auto sm:w-96 sm:p-4"
        >
          <CountdownRing value={ringValue} total={ringTotal} />
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-wider text-zinc-400 uppercase">Up next</p>
            <p className="truncate text-sm font-semibold text-white">
              <span className="font-mono text-accent-text">{fmtEpisode(next.index)}</span>{' '}
              {next.title || `Episode ${next.index + 1}`}
            </p>
          </div>
          <button type="button" onClick={cancelUpNext} className={`${buttonClass('ghost')} shrink-0`}>
            Cancel
          </button>
          <button type="button" onClick={() => switchTo(next.key)} className={`${buttonClass()} shrink-0`}>
            Play now
          </button>
        </div>
      )}
    </div>
  )
}

function ChromeButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 disabled:opacity-40 sm:h-10 sm:w-10"
    >
      {children}
    </button>
  )
}

function CountdownRing({ value, total }: { value: number; total: number }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const fraction = Math.max(0, Math.min(1, value / total))
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-accent-hi transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {Math.max(0, Math.ceil(value))}
      </span>
    </div>
  )
}
