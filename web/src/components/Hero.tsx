import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Show } from '../api'
import { ArrowRightIcon, PlayIcon } from './icons'
import { showPath } from './ShowCard'
import { Poster } from './ui'

interface HeroProps {
  show: Show
  hasContinue: boolean
  onContinue: () => void
}

export function Hero({ show, hasContinue, onContinue }: HeroProps) {
  const to = showPath(show)
  const tags = show.tags.slice(0, 3).join(' · ')

  return (
    <section aria-label="Featured drama" className="relative isolate -mt-28 flex min-h-[max(70vh,420px)] flex-col justify-end overflow-hidden bg-black">
      {show.cover && (
        <img
          src={show.cover}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 h-full w-full scale-110 object-cover object-top opacity-75 blur-[2px] md:opacity-70 md:blur-xl"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/60 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/40 to-transparent" />
      {show.cover && (
        <div className="absolute top-1/2 right-10 -z-10 hidden h-[78%] -translate-y-1/2 overflow-hidden rounded-lg shadow-2xl shadow-black/80 md:block aspect-[3/4] lg:right-16">
          <Poster src={show.cover} name={show.name} className="h-full" />
        </div>
      )}

      <div className="relative z-0 space-y-4 px-4 pt-32 pb-10 sm:px-6 sm:pb-12 lg:px-10">
        <h1 className="line-clamp-2 max-w-2xl text-4xl leading-[1.05] font-black tracking-tight sm:text-5xl md:text-7xl">
          {show.name}
        </h1>
        {tags && <p className="text-sm font-medium text-muted">{tags}</p>}
        {show.introduction && (
          <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">{show.introduction}</p>
        )}
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            to={to}
            className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:bg-white/80"
          >
            <PlayIcon className="h-4 w-4" />
            Play
          </Link>
          <Link
            to={to}
            className="inline-flex items-center rounded-md bg-white/25 px-6 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/35"
          >
            More Info
          </Link>
        </div>

        <div className="grid max-w-4xl gap-3 pt-4 sm:grid-cols-3">
          {hasContinue ? (
            <QuickTile title="Continue Watching" subtitle="Pick up where you left off" onClick={onContinue} />
          ) : (
            <QuickTile title="Continue Watching" subtitle="Pick up where you left off" to="/library" />
          )}
          <QuickTile title="Browse by Platform" subtitle="All your enabled apps" to="/browse" />
          <QuickTile
            title="New & Popular"
            subtitle="Most watched right now"
            to="/browse?sort=popular"
            arrow
          />
        </div>
      </div>
    </section>
  )
}

function QuickTile({
  title,
  subtitle,
  to,
  onClick,
  arrow = false,
}: {
  title: string
  subtitle: string
  to?: string
  onClick?: () => void
  arrow?: boolean
}) {
  const body: ReactNode = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-bold text-white">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span>
      </span>
      {arrow && <ArrowRightIcon className="h-5 w-5 shrink-0 text-rose-500" />}
    </>
  )
  const className =
    'flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left backdrop-blur transition hover:bg-white/10 focus-visible:bg-white/10'
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}
