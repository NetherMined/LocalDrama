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
  const tiles: TileProps[] = [
    hasContinue
      ? { title: 'Continue Watching', subtitle: 'Pick up where you left off', onClick: onContinue }
      : { title: 'Continue Watching', subtitle: 'Pick up where you left off', to: '/library' },
    { title: 'Browse by Platform', subtitle: 'All your enabled apps', to: '/browse' },
    { title: 'New & Popular', subtitle: 'Most watched right now', to: '/browse?sort=popular', arrow: true },
  ]

  return (
    <section
      aria-label="Featured drama"
      className="relative isolate flex max-h-[60svh] min-h-[360px] flex-col justify-end overflow-hidden bg-black sm:-mt-28 sm:max-h-none sm:min-h-[max(70vh,420px)] short:mt-0 short:max-h-[85svh] short:min-h-0"
    >
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
        <div className="absolute top-1/2 right-10 -z-10 hidden h-[78%] -translate-y-1/2 overflow-hidden rounded-lg shadow-2xl shadow-black/80 xl:block aspect-[3/4] xl:right-16 short:hidden">
          <Poster src={show.cover} name={show.name} className="h-full" />
        </div>
      )}

      <div className="relative z-0 space-y-3 px-4 pt-6 pb-5 sm:space-y-4 sm:px-6 sm:pt-32 sm:pb-12 short:space-y-2 short:pt-4 short:pb-4 lg:px-10">
        <h1 className="line-clamp-2 max-w-2xl text-3xl leading-tight font-black tracking-tight sm:text-5xl md:text-7xl short:text-2xl short:leading-[1.1]">
          {show.name}
        </h1>
        {tags && <p className="line-clamp-1 text-sm font-medium text-muted">{tags}</p>}
        {show.introduction && (
          <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-white/80 sm:line-clamp-3 sm:text-base short:line-clamp-2">
            {show.introduction}
          </p>
        )}
        <div className="flex gap-3 pt-1 sm:flex-wrap">
          <Link
            to={to}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:bg-white/80 sm:flex-none"
          >
            <PlayIcon className="h-4 w-4" />
            Play
          </Link>
          <Link
            to={to}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-white/25 px-6 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/35 sm:flex-none"
          >
            More Info
          </Link>
        </div>

        <ul className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-2 sm:hidden short:hidden">
          {tiles.map((tile) => (
            <li key={tile.title} className="snap-start shrink-0">
              <QuickChip {...tile} />
            </li>
          ))}
        </ul>

        <div className="hidden max-w-4xl gap-3 pt-4 sm:grid sm:grid-cols-3 short:hidden">
          {tiles.map((tile) => (
            <QuickTile key={tile.title} {...tile} />
          ))}
        </div>
      </div>
    </section>
  )
}

interface TileProps {
  title: string
  subtitle: string
  to?: string
  onClick?: () => void
  arrow?: boolean
}

function QuickChip({ title, to, onClick, arrow = false }: TileProps) {
  const className =
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-semibold whitespace-nowrap text-white backdrop-blur transition hover:bg-white/15 focus-visible:bg-white/15'
  const body: ReactNode = (
    <>
      {title}
      {arrow && <ArrowRightIcon className="h-4 w-4 shrink-0 text-accent-text" />}
    </>
  )
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

function QuickTile({ title, subtitle, to, onClick, arrow = false }: TileProps) {
  const body: ReactNode = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-bold text-white">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span>
      </span>
      {arrow && <ArrowRightIcon className="h-5 w-5 shrink-0 text-accent-text" />}
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
