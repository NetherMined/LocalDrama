import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Show } from '../api'
import { detectPlatform } from '../install'
import { setFavourite, useFavourites } from '../lib/favourites'
import { errorMessage, fmtCount } from '../lib/format'
import { shareLink } from '../lib/share'
import { useStatus } from '../status'
import { PlatformLogo } from './PlatformLogo'
import { useRequireAccount } from './SignInPrompt'
import { BookmarkIcon, PlayIcon, ShareIcon } from './icons'
import { Toast, useToast } from './Toast'
import { Poster } from './ui'

interface ShowCardProps {
  show: Show
  to?: string
  /** 0 to 1; draws a thin progress bar at the bottom of the poster when set. */
  progress?: number
  /** Replaces the default meta line. */
  caption?: ReactNode
  /** Overrides the show's own badge, e.g. "Trending" on the trending row. */
  badge?: string
}

export const showGridClass = 'grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7'

export function showPath(show: Pick<Show, 'bookId' | 'source'>): string {
  const base = `/show/${encodeURIComponent(show.bookId)}`
  return show.source ? `${base}?source=${encodeURIComponent(show.source)}` : base
}

export function ShowCard({ show, to, progress, caption, badge }: ShowCardProps) {
  const href = to ?? showPath(show)
  const percent = progress === undefined ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100)
  const tag = badge ?? show.badge ?? null
  const meta = caption ?? [show.tags[0], 'Series', show.tags[1]].filter(Boolean).join(' | ')
  const { status } = useStatus()
  const signedIn = !!status?.authenticated
  const favourites = useFavourites(signedIn)
  const listed = favourites.has(show.bookId)
  const requireAccount = useRequireAccount()
  const navigate = useNavigate()
  const [toast, notify] = useToast()
  const tv = detectPlatform() === 'tv'
  const actionTab = tv ? -1 : undefined

  async function toggleFavourite() {
    try {
      await setFavourite(show.bookId, !listed)
    } catch (err) {
      notify(errorMessage(err), 'err')
    }
  }

  async function share() {
    const result = await shareLink({ title: show.name, url: new URL(href, window.location.origin).toString() })
    if (result === 'copied') notify('Link copied', 'ok')
    else if (result === 'failed') notify('Could not copy the link', 'err')
  }

  return (
    <div className="group/card relative">
      <div className="relative rounded-xl transition duration-200 pointer-fine:group-hover/card:scale-[1.04] pointer-fine:group-hover/card:shadow-xl pointer-fine:group-hover/card:shadow-black/60 pointer-fine:group-hover/card:ring-2 pointer-fine:group-hover/card:ring-white/90 group-focus-within/card:scale-[1.04] group-focus-within/card:shadow-xl group-focus-within/card:shadow-black/60 group-focus-within/card:ring-2 group-focus-within/card:ring-white/90">
        <Link to={href} data-card-link="" className={`block rounded-xl ${tv ? '' : 'outline-none'}`}>
          <div className="relative overflow-hidden rounded-xl bg-panel-2">
            <PosterArt show={show} tag={tag} percent={percent} />
          </div>
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 rounded-b-xl bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-8 opacity-0 transition pointer-fine:group-hover/card:pointer-events-auto pointer-fine:group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
          <Link
            to={href}
            tabIndex={actionTab}
            onClick={(e) => {
              if (signedIn) return
              e.preventDefault()
              requireAccount(() => navigate(href), { showName: show.name })
            }}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-black transition hover:bg-white/85 sm:text-sm"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            Play
          </Link>
          <button
            type="button"
            tabIndex={actionTab}
            onClick={() => requireAccount(() => void toggleFavourite(), { showName: show.name })}
            aria-label={listed ? `Remove ${show.name} from My List` : `Add ${show.name} to My List`}
            aria-pressed={listed}
            title={listed ? 'In My List' : 'Add to My List'}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <BookmarkIcon className="h-4 w-4" filled={listed} />
          </button>
          <button
            type="button"
            tabIndex={actionTab}
            onClick={() => void share()}
            aria-label={`Share ${show.name}`}
            title="Share"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <ShareIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Link to={href} tabIndex={-1} aria-hidden="true" className="block">
        <p className="mt-3 line-clamp-1 text-sm font-semibold text-white">{show.name}</p>
        {meta && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{meta}</p>}
      </Link>
      <Toast toast={toast} />
    </div>
  )
}

function PosterArt({ show, tag, percent }: { show: Show; tag: string | null; percent: number | null }) {
  const platform = show.sourceName ?? show.source ?? null
  const plays = fmtCount(show.playCount)
  return (
    <>
      <Poster src={show.cover} name={show.name} aspect="portrait" />
      {tag && (
        <span className="absolute top-2 left-2 rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
          {tag}
        </span>
      )}
      {platform && (
        <span title={platform} className="absolute top-2 right-2 flex items-center rounded bg-black/50 p-0.5 opacity-80">
          <PlatformLogo id={show.source} name={show.sourceName ?? platform} size={16} decorative />
        </span>
      )}
      {plays && (
        <>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
          <span className="absolute right-2 bottom-2.5 inline-flex items-center gap-1 text-xs font-semibold text-white transition pointer-fine:group-hover/card:opacity-0 group-focus-within/card:opacity-0">
            <PlayIcon className="h-3 w-3" />
            {plays}
          </span>
        </>
      )}
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
    </>
  )
}
