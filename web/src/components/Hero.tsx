import { useEffect, useState } from 'react'
import type { TouchEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Show } from '../api'
import { ChevronRightIcon, PlayIcon } from './icons'
import { useRequireAccount } from './SignInPrompt'
import { showPath } from './ShowCard'
import { useStatus } from '../status'

const INTERVAL_MS = 6000
const SWIPE_PX = 50

export function Hero({ shows }: { shows: Show[] }) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const requireAccount = useRequireAccount()
  const navigate = useNavigate()
  const signedIn = !!useStatus().status?.authenticated
  const count = shows.length
  const current = Math.min(index, Math.max(0, count - 1))
  const paused = hovered || focused || reduceMotion

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduceMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (paused || count < 2) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [paused, count, current])

  if (count === 0) return null

  function go(step: 1 | -1) {
    setIndex((i) => (Math.min(i, count - 1) + step + count) % count)
  }

  function onTouchEnd(e: TouchEvent<HTMLElement>) {
    const end = e.changedTouches[0]?.clientX
    const start = touchStart
    setTouchStart(null)
    if (start === null || end === undefined || count < 2) return
    if (Math.abs(end - start) >= SWIPE_PX) go(end < start ? 1 : -1)
  }

  return (
    <section
      aria-label="Featured dramas"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      onTouchStart={(e) => setTouchStart(e.touches[0]?.clientX ?? null)}
      onTouchEnd={onTouchEnd}
      className="relative isolate -mt-16 h-[70svh] min-h-[460px] overflow-hidden bg-black sm:-mt-28 sm:h-[min(85vh,760px)] sm:min-h-[520px] max-sm:short:-mt-12 short:h-[88svh] short:min-h-0 sm:short:-mt-[5.25rem] sm:short:h-[88svh] sm:short:min-h-0"
    >
      {shows.map((show, i) => {
        const active = i === current
        const tag = show.tags[0]
        return (
          <div
            key={show.bookId}
            className={`absolute inset-0 transition-[opacity,visibility] duration-700 ${
              active ? 'visible opacity-100' : 'invisible opacity-0'
            }`}
          >
            {show.cover && (
              <img
                src={show.cover}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
                className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/10 sm:via-black/50" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-16 sm:px-6 sm:pb-16 lg:px-10 lg:pb-24 short:pb-8">
              <div className="max-w-xl sm:max-w-[min(36rem,58%)] lg:max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-bold tracking-wide text-white uppercase">
                    Hot
                  </span>
                  {tag && (
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      {tag}
                    </span>
                  )}
                </div>
                <h2 className="mt-4 line-clamp-2 text-3xl leading-[1.15] font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl short:text-2xl">
                  {show.name}
                </h2>
                {show.introduction && (
                  <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/80 sm:mt-4 sm:text-base short:hidden">
                    {show.introduction}
                  </p>
                )}
                <Link
                  to={showPath(show)}
                  data-spatial-initial={active ? '' : undefined}
                  tabIndex={active ? undefined : -1}
                  onClick={(e) => {
                    if (signedIn) return
                    e.preventDefault()
                    requireAccount(() => navigate(showPath(show)), { showName: show.name })
                  }}
                  className="mt-6 inline-flex w-[260px] max-w-full items-center justify-center gap-2 rounded-full bg-white px-8 py-3 text-base font-bold text-black transition hover:bg-white/85 short:mt-3 short:py-2"
                >
                  <PlayIcon className="h-4 w-4" />
                  Play
                </Link>
              </div>
            </div>
          </div>
        )
      })}

      <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center sm:hidden">
        {shows.map((show, i) => (
          <button
            key={show.bookId}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${show.name}`}
            aria-current={i === current ? 'true' : undefined}
            className="flex h-11 w-7 items-center justify-center"
          >
            <span className={`h-1.5 rounded-full transition-all ${i === current ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
          </button>
        ))}
      </div>

      <div className="absolute right-4 bottom-6 z-20 hidden items-end gap-2 sm:flex lg:right-10 lg:bottom-10 lg:gap-3 short:bottom-4">
        {shows.map((show, i) => (
          <button
            key={show.bookId}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${show.name}`}
            aria-current={i === current ? 'true' : undefined}
            className={`h-20 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-panel-2 transition lg:h-32 lg:w-24 ${
              i === current ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            {show.cover ? (
              <img src={show.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-bold text-muted">
                {show.name.charAt(0).toUpperCase()}
              </span>
            )}
          </button>
        ))}
        {count > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next show"
            className="ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full border border-white/40 bg-black/60 text-white transition hover:bg-black/80"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </section>
  )
}
