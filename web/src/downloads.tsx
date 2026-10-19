import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, useEvents, type DownloadItem } from './api'

interface DownloadsValue {
  items: DownloadItem[]
  loaded: boolean
  error: string | null
  activeCount: number
  byEpisode: (bookId: string, episodeIndex: number) => DownloadItem | undefined
  refresh: () => Promise<void>
}

const DownloadsContext = createContext<DownloadsValue | null>(null)

function newer(a: DownloadItem, b: DownloadItem): boolean {
  return new Date(a.updatedAt).getTime() > new Date(b.updatedAt).getTime()
}

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<Map<string, DownloadItem>>(() => new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { items } = await api.downloads()
      setById(new Map(items.map((item) => [String(item.id), item])))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load downloads')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEvents((event) => {
    if (event.type === 'open') {
      void refresh()
    } else if (event.type === 'download') {
      setById((prev) => {
        const key = String(event.item.id)
        const current = prev.get(key)
        if (current && newer(current, event.item)) return prev
        const next = new Map(prev)
        next.set(key, event.item)
        return next
      })
    }
  })

  const value = useMemo<DownloadsValue>(() => {
    const items = [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const activeCount = items.filter((i) => i.status === 'queued' || i.status === 'downloading').length
    const byEpisode = (bookId: string, episodeIndex: number) =>
      items.find((i) => i.bookId === bookId && i.episodeIndex === episodeIndex)
    return { items, loaded, error, activeCount, byEpisode, refresh }
  }, [byId, loaded, error, refresh])

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>
}

export function useDownloads(): DownloadsValue {
  const value = useContext(DownloadsContext)
  if (!value) throw new Error('useDownloads must be used inside DownloadsProvider')
  return value
}
