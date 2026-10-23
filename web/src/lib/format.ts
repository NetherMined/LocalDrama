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

export function fmtWatchTime(seconds: number): string {
  const secs = Math.max(0, seconds)
  if (secs > 0 && secs < 60) return `${Math.round(secs)}s`
  const totalMinutes = Math.floor(secs / 60)
  const hours = Math.floor(totalMinutes / 60)
  if (hours > 0) return `${hours}h ${totalMinutes % 60}m`
  return `${totalMinutes}m`
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function fmtDayShort(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtDate(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return 'unknown'
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtAgoOrNever(iso: string | null): string {
  return iso ? fmtAgo(iso) : 'Never'
}

export function isGenericEpisodeName(name: string): boolean {
  return !name.trim() || /^(episode|ep|e)[\s.]*\d+$/i.test(name.trim())
}

export function fmtCount(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return trimmed || null
    value = Number(trimmed)
  }
  if (!Number.isFinite(value) || value <= 0) return null
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [size, suffix] of units) {
    if (value >= size) return `${(value / size).toFixed(1).replace(/\.0$/, '')}${suffix}`
  }
  return String(Math.round(value))
}
