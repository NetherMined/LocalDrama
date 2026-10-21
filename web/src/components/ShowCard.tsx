import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Show } from '../api'
import { PlayIcon } from './icons'
import { Poster } from './ui'

interface ShowCardProps {
  show: Show
  to?: string
  /** 0 to 1; draws a thin progress bar over the thumbnail when set. */
  progress?: number
  /** Replaces the default subtitle line. */
  caption?: ReactNode
}

export function showPath(show: Pick<Show, 'bookId' | 'source'>): string {
  const base = `/show/${encodeURIComponent(show.bookId)}`
  return show.source ? `${base}?source=${encodeURIComponent(show.source)}` : base
}

export function ShowCard({ show, to, progress, caption }: ShowCardProps) {
  const percent = progress === undefined ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100)
  const subtitle = caption ?? show.tags[0] ?? show.sourceName ?? null
  return (
    <Link to={to ?? showPath(show)} className="group/card block rounded-md outline-none">
      <div className="relative overflow-hidden rounded-md bg-panel-2 ring-0 ring-accent-hi transition duration-200 group-hover/card:scale-105 group-hover/card:shadow-xl group-hover/card:shadow-black/70 group-hover/card:ring-2 group-hover/card:ring-white/40 group-focus-visible/card:ring-2">
        <Poster src={show.cover} name={show.name} aspect="landscape" />
        {show.sourceName && (
          <span className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-rose-500 uppercase">
            {show.sourceName}
          </span>
        )}
        {show.episodeCount > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
            {show.episodeCount} ep
          </span>
        )}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-200 group-hover/card:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/60">
            <PlayIcon className="h-5 w-5 translate-x-px" />
          </span>
        </span>
        {percent !== null && (
          <div
            role="progressbar"
            aria-label={`${show.name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="absolute inset-x-0 bottom-0 h-1 bg-black/60"
          >
            <div className="h-full bg-accent-hi" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-medium text-white/90 group-hover/card:text-white">{show.name}</p>
      {subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{subtitle}</p>}
    </Link>
  )
}
