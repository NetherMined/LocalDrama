import { useState, type ReactNode } from 'react'
import { isRegionBlocked } from '../lib/format'

export function buttonClass(variant: 'primary' | 'ghost' | 'danger' = 'primary'): string {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'
  if (variant === 'primary') return `${base} bg-accent text-white hover:bg-rose-500`
  if (variant === 'danger') return `${base} border border-line bg-panel-2 text-white hover:border-accent-hi`
  return `${base} border border-line bg-panel-2 text-white hover:bg-line`
}

export function Poster({ src, name, className = '' }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={name}
        className={`flex aspect-[3/4] items-center justify-center bg-gradient-to-br from-panel-2 to-line text-3xl font-bold text-muted ${className}`}
      >
        {name.charAt(0).toUpperCase() || '?'}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`aspect-[3/4] w-full bg-panel-2 object-cover ${className}`}
    />
  )
}

export function ErrorPanel({
  message,
  title = 'Something went wrong',
  onRetry,
}: {
  message: string
  title?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="rounded-lg border border-accent/40 bg-accent/10 p-5">
      <h2 className="text-base font-semibold text-accent-hi">{title}</h2>
      <p className="mt-1 text-sm whitespace-pre-line text-white/90">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${buttonClass('ghost')} mt-4`}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-14 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  )
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[3/4] rounded-md bg-panel-2" />
          <div className="mt-2 h-3 w-3/4 rounded bg-panel-2" />
        </div>
      ))}
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {children}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-sm text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-hi" aria-hidden="true" />
      {label}
    </div>
  )
}

export function RegionBlockedPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-5">
      <h2 className="text-base font-semibold text-amber-300">Dramabox blocked this connection</h2>
      <p className="mt-1 text-sm text-white/90">
        The Dramabox API rejected requests from this network (often a restricted region such as South Africa). Configure a
        proxy outside that region in Settings.
      </p>
      <p className="mt-2 text-xs whitespace-pre-line text-muted">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${buttonClass('ghost')} mt-4`}>
          Try again
        </button>
      )}
    </div>
  )
}

export function LoadError({ message, title, onRetry }: { message: string; title?: string; onRetry?: () => void }) {
  if (isRegionBlocked(message)) return <RegionBlockedPanel message={message} onRetry={onRetry} />
  return <ErrorPanel message={message} title={title} onRetry={onRetry} />
}

export const inputClass = 'mt-2 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent-hi'

export interface Notice {
  kind: 'ok' | 'err'
  text: string
}

export function NoticeText({ notice }: { notice: Notice }) {
  return (
    <p role={notice.kind === 'err' ? 'alert' : 'status'} className={`text-sm ${notice.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
      {notice.text}
    </p>
  )
}

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-xl border border-line bg-panel p-5 sm:p-6">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}
