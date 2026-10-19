export function fmtMB(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function fmtPercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)))
}

export function fmtEpisode(index: number): string {
  return `E${String(index + 1).padStart(2, '0')}`
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

export function isRegionBlocked(message: string): boolean {
  return /\b403\b|blocked in your region/i.test(message)
}

export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) return '/'
  return raw
}

export function fmtGB(bytes: number): string {
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

export function fmtUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function fmtAgo(at: number | string, now = Date.now()): string {
  let ms = typeof at === 'number' ? at : Date.parse(at)
  if (typeof at === 'number' && at < 1e12) ms = at * 1000
  if (!Number.isFinite(ms)) return 'unknown'
  const diff = Math.max(0, now - ms)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function fmtMinutesLeft(position: number, duration: number): string {
  const minutes = Math.max(1, Math.round((duration - position) / 60))
  return `${minutes} min left`
}
