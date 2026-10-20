import { useEffect, useRef } from 'react'

type Props = {
  src: string
  hls?: boolean
  poster?: string
}

type HlsInstance = {
  loadSource: (url: string) => void
  attachMedia: (video: HTMLVideoElement) => void
  destroy: () => void
}

export function VideoPlayer({ src, hls, poster }: Props) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    let cancelled = false
    let instance: HlsInstance | null = null

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
