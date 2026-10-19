import { Link } from 'react-router-dom'
import type { Show } from '../api'
import { Poster } from './ui'

interface ShowCardProps {
  show: Show
  to?: string
  /** 0 to 1; draws a thin progress bar over the poster when set. */
  progress?: number
  /** Replaces the default episode count line. */
  caption?: string
}

export function ShowCard({ show, to, progress, caption }: ShowCardProps) {
  const percent = progress === undefined ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100)
  return (
    <Link
      to={to ?? `/show/${encodeURIComponent(show.bookId)}`}
      className="group block rounded-md outline-none"
    >
      <div className="relative overflow-hidden rounded-md ring-0 ring-accent-hi transition duration-200 group-hover:scale-[1.03] group-hover:shadow-xl group-hover:shadow-black/60 group-focus-visible:ring-2">
        <Poster src={show.cover} name={show.name} />
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
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-white/90 group-hover:text-white">
        {show.name}
      </p>
      <p className="mt-0.5 text-xs text-muted">{caption ?? `${show.episodeCount} episodes`}</p>
    </Link>
  )
}
