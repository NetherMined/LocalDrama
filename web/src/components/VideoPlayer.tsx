import { useEffect, useRef } from 'react'

export interface PlayerSample {
  position: number
  duration: number
}

type Props = {
  src: string
  hls?: boolean
  poster?: string
  /** Seconds to seek to once the metadata has loaded. */
  startAt?: number
  /** Called with the playhead while playing (every 10 s), on pause and on end. `beacon` is true when the page is leaving. */
  onSave?: (sample: PlayerSample, beacon: boolean) => void
}

type HlsInstance = {
  loadSource: (url: string) => void
  attachMedia: (video: HTMLVideoElement) => void
  destroy: () => void
}

const SAVE_INTERVAL_MS = 10_000

export function VideoPlayer({ src, hls, poster, startAt = 0, onSave }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const saveRef = useRef(onSave)
  const startRef = useRef(startAt)
  const lastSaveRef = useRef(0)

  // Latest callbacks for the event handlers and the unmount flush, which run after this render's closure is stale.
  useEffect(() => {
    saveRef.current = onSave
    startRef.current = startAt
  })

  useEffect(() => {
    const video = ref.current
    if (!video) return
    let cancelled = false
    let instance: HlsInstance | null = null

    const sample = (): PlayerSample | null => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      if (duration <= 0 || video.currentTime <= 0) return null
      return { position: video.currentTime, duration }
    }

    const save = (beacon: boolean, override?: PlayerSample) => {
      const s = override ?? sample()
      if (s) saveRef.current?.(s, beacon)
    }

    const onLoadedMetadata = () => {
      if (startRef.current > 0) video.currentTime = startRef.current
    }
    const onPlaying = () => {
      lastSaveRef.current = Date.now()
    }
    const onTimeUpdate = () => {
      if (video.paused) return
      const now = Date.now()
      if (now - lastSaveRef.current < SAVE_INTERVAL_MS) return
      lastSaveRef.current = now
      save(false)
    }
    const onPause = () => {
      save(false)
    }
    const onEnded = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      if (duration > 0) save(false, { position: duration, duration })
    }
    const onPageHide = () => {
      save(true)
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    window.addEventListener('pagehide', onPageHide)

    async function setup() {
      if (!video) return
      if (!hls) {
        video.src = src
        return
      }

      const { default: Hls } = await import('hls.js')
      if (cancelled) return
      if (!Hls.isSupported()) {
        // Safari/iOS can play HLS natively.
        video.src = src
        return
      }
      instance = new Hls({ enableWorker: true })
      instance.loadSource(src)
      instance.attachMedia(video)
    }

    void setup()

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      window.removeEventListener('pagehide', onPageHide)
      save(true)
      instance?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [src, hls])

  return (
    <video
      ref={ref}
      controls
      autoPlay
      playsInline
      poster={poster}
      className="aspect-video w-full"
    />
  )
}
