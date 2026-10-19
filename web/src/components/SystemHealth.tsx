import { useCallback, useEffect, useState } from 'react'
import { api, type Health } from '../api'
import { errorMessage, fmtGB, fmtUptime } from '../lib/format'
import { RefreshIcon } from './icons'
import { Section, Spinner, buttonClass } from './ui'

export function SystemHealth() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setHealth(await api.health())
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Section id="system" title="System" description="Server health and disk space.">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh system health"
          title="Refresh"
          className={buttonClass('ghost')}
        >
          <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {!health && !error && <Spinner label="Loading system health" />}
      {error && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {health && (
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Version" value={health.version} />
          <Stat label="Uptime" value={fmtUptime(health.uptime)} />
          <Stat
            label="Disk"
            value={
              health.disk
                ? `${fmtGB(health.disk.freeBytes)} free of ${fmtGB(health.disk.totalBytes)}`
                : 'Unavailable'
            }
          />
          <Stat label="Database" value={health.db === 'ok' ? 'OK' : 'Error'} tone={health.db === 'ok' ? 'ok' : 'bad'} />
          <Stat
            label="Upstream"
            value={health.upstream.ok ? 'Reachable' : 'Unreachable'}
            tone={health.upstream.ok ? 'ok' : 'bad'}
          />
          <Stat
            label="Queue"
            value={`${health.queue.queued} queued · ${health.queue.downloading} downloading · ${health.queue.paused} paused · ${health.queue.failed} failed`}
          />
        </dl>
      )}
    </Section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-white'
  return (
    <div>
      <dt className="text-xs tracking-wider text-muted uppercase">{label}</dt>
      <dd className={`mt-1 font-medium ${color}`}>{value}</dd>
    </div>
  )
}
