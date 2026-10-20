import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type AppStatus } from './api'
import { errorMessage } from './lib/format'

interface StatusValue {
  status: AppStatus | null
  loading: boolean
  error: string | null
  reload: () => Promise<AppStatus | null>
}

const StatusContext = createContext<StatusValue | null>(null)

const STATUS_REFRESH_MS = 60_000

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const next = await api.status()
      setStatus(next)
      setError(null)
      return next
    } catch (err) {
      setError(errorMessage(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const id = window.setInterval(() => {
      api
        .status()
        .then((next) => {
          setStatus(next)
          setError(null)
        })
        .catch(() => {
          // Keep the last known status; the banner stays as it was.
        })
    }, STATUS_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  const value = useMemo(() => ({ status, loading, error, reload }), [status, loading, error, reload])
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
}

export function useStatus(): StatusValue {
  const value = useContext(StatusContext)
  if (!value) throw new Error('useStatus must be used inside StatusProvider')
  return value
}
