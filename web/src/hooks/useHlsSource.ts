import { useEffect, useRef, type RefObject } from 'react'

export interface HlsSource {
  src: string
  hls: boolean
}

interface HlsInstance {
  loadSource: (url: string) => void
  attachMedia: (video: HTMLVideoElement) => void
  destroy: () => void
  on?: (event: string, listener: (event: string, data: { fatal?: boolean; details?: string }) => void) => void
}

/**
 * Points a video element at a source (native or HLS via hls.js). The source object identity drives the
 * effect, so setting a new object reattaches even when the URL is unchanged. Clearing it to null detaches.
 */
export function useHlsSource(
  videoRef: RefObject<HTMLVideoElement | null>,
  source: HlsSource | null,
  onError?: (message: string) => void,
) {
  const errorRef = useRef(onError)

  useEffect(() => {
    errorRef.current = onError
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video || !source) return
    let cancelled = false
    let instance: HlsInstance | null = null
    const { src, hls } = source

    if (!hls) {
      video.src = src
    } else {
      void (async () => {
        const { default: Hls } = await import('hls.js')
        if (cancelled) return
        if (!Hls.isSupported()) {
          // Safari/iOS can play HLS natively.
          video.src = src
          return
        }
        const hlsInstance = new Hls({ enableWorker: true }) as unknown as HlsInstance
        instance = hlsInstance
        hlsInstance.on?.('hlsError', (_event, data) => {
          if (data.fatal) errorRef.current?.(data.details || 'The stream stopped working.')
        })
        hlsInstance.loadSource(src)
        hlsInstance.attachMedia(video)
      })()
    }

    return () => {
      cancelled = true
      instance?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [videoRef, source])
}
