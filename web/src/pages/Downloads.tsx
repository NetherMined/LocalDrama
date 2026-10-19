import { useEffect, useState } from 'react'
import { api, type DownloadItem } from '../api'
import { useDownloads } from '../downloads'
import { StatusPill } from '../components/StatusPill'
import { EmptyState, PageHeader, Spinner, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode, fmtMB, fmtPercent } from '../lib/format'

const MAX_ATTEMPTS = 4

export function Downloads() {
  const { items, loaded, error, refresh } = useDownloads()
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const hasActive = items.some((i) => i.status === 'queued' || i.status === 'downloading')
  const hasPaused = items.some((i) => i.status === 'paused')
  const hasCompleted = items.some((i) => i.status === 'completed')

  async function run(item: DownloadItem, action: () => Promise<unknown>) {
    const key = String(item.id)
    setActionError(null)
    setPending((prev) => new Set(prev).add(key))
    try {
      await action()
      await refresh()
    } catch (err) {
      setActionError(`${item.showName} ${fmtEpisode(item.episodeIndex)}: ${errorMessage(err)}`)
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  async function bulk(action: () => Promise<unknown>) {
    setActionError(null)
    setBulkBusy(true)
    try {
      await action()
      await refresh()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Downloads">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={bulkBusy || !hasActive}
            onClick={() => void bulk(() => api.pauseAll())}
            className={buttonClass('ghost')}
          >
            Pause all
          </button>
          <button
            type="button"
            disabled={bulkBusy || !hasPaused}
            onClick={() => void bulk(() => api.resumeAll())}
            className={buttonClass('ghost')}
          >
            Resume all
          </button>
          <button
            type="button"
            disabled={bulkBusy || !hasCompleted}
            onClick={() => void bulk(() => api.clearCompleted())}
            className={buttonClass('ghost')}
          >
            Clear completed
          </button>
        </div>
      </PageHeader>

      {actionError && (
        <p role="alert" className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {actionError}
        </p>
      )}

      {!loaded && <Spinner label="Loading downloads" />}
      {loaded && error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {loaded && items.length === 0 && (
        <EmptyState title="No downloads yet">
          Open a drama from Browse or Search and choose episodes to download.
        </EmptyState>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {items.map((item) => {
            const busy = pending.has(String(item.id))
            const showBar = item.status === 'downloading' || item.status === 'completed' || item.status === 'paused'
            const pct = item.status === 'completed' ? 100 : fmtPercent(item.bytesDone, item.bytesTotal)
            const canPause = item.status === 'queued' || item.status === 'downloading'
            const canResume = item.status === 'paused'
            const canRemove = item.status === 'queued' || item.status === 'paused' || item.status === 'failed'
            const canRetry = item.status === 'failed'
            const hasActions = canPause || canResume || canRemove || canRetry
            return (
              <li key={String(item.id)} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.showName}</p>
                    <p className="truncate text-sm text-muted">
                      <span className="font-mono">{fmtEpisode(item.episodeIndex)}</span> · {item.episodeName}
                    </p>
                  </div>
                  <StatusPill status={item.status} bytesDone={item.bytesDone} bytesTotal={item.bytesTotal} />
                </div>

                {showBar && (
                  <div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-line"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      aria-label={`${item.showName} ${fmtEpisode(item.episodeIndex)} progress`}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          item.status === 'paused' ? 'bg-amber-400' : 'bg-accent'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {item.bytesTotal > 0
                        ? `${fmtMB(item.bytesDone)} / ${fmtMB(item.bytesTotal)}`
                        : item.bytesDone > 0
                          ? fmtMB(item.bytesDone)
                          : item.status === 'paused'
                            ? 'Paused'
                            : 'Starting...'}
                    </p>
                  </div>
                )}

                {item.status === 'queued' && <RetryCountdown nextAttemptAt={item.nextAttemptAt} attempts={item.attempts ?? 0} />}

                {item.status === 'failed' && item.error && (
                  <p className="text-sm whitespace-pre-line text-red-300">{item.error}</p>
                )}

                {hasActions && (
                  <div className="flex flex-wrap gap-2">
                    {canResume && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(item, () => api.resumeDownload(item.id))}
                        className={buttonClass('ghost')}
                      >
                        Resume
                      </button>
                    )}
                    {canPause && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(item, () => api.pauseDownload(item.id))}
                        className={buttonClass('ghost')}
                      >
                        Pause
                      </button>
                    )}
                    {canRetry && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(item, () => api.retryDownload(item.id))}
                        className={buttonClass('ghost')}
                      >
                        Retry
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(item, () => api.removeDownload(item.id))}
                        className={buttonClass('danger')}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function RetryCountdown({ nextAttemptAt, attempts }: { nextAttemptAt?: number | null; attempts: number }) {
  const target = nextAttemptAt ?? 0
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!target) return
    setNow(Date.now())
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= target) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [target])

  if (!target || target <= now) return null
  const seconds = Math.ceil((target - now) / 1000)
  const nextAttempt = Math.min(attempts + 1, MAX_ATTEMPTS)
  return (
    <p className="text-xs text-amber-300">
      Retrying in {seconds}s (attempt {nextAttempt}/{MAX_ATTEMPTS})
    </p>
  )
}
