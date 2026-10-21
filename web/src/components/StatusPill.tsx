import type { DownloadStatus } from '../api'
import { fmtPercent } from '../lib/format'

const styles: Record<DownloadStatus | 'downloaded', string> = {
  queued: 'bg-line text-white/80',
  downloading: 'bg-accent/20 text-accent-text',
  paused: 'bg-amber-400/15 text-amber-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/20 text-red-300',
  downloaded: 'bg-emerald-500/15 text-emerald-300',
}

const labels: Record<DownloadStatus | 'downloaded', string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  paused: 'Paused',
  completed: 'Downloaded',
  failed: 'Failed',
  downloaded: 'Downloaded',
}

export function StatusPill({
  status,
  bytesDone,
  bytesTotal,
}: {
  status: DownloadStatus | 'downloaded' | 'none'
  bytesDone?: number
  bytesTotal?: number
}) {
  if (status === 'none') return null
  const label =
    status === 'downloading'
      ? `Downloading ${fmtPercent(bytesDone ?? 0, bytesTotal ?? 0)}%`
      : labels[status]
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${styles[status]}`}>
      {label}
    </span>
  )
}
