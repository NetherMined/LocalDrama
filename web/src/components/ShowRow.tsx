import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { PlatformLogo } from './PlatformLogo'

// Room under the cards for the hover panel. The list has matching negative margin, so the row keeps its height.
const itemClass = 'w-[42vw] max-w-[200px] shrink-0 snap-start sm:w-[220px] sm:max-w-none lg:w-[260px]'

const arrowClass =
  'absolute top-[calc(50%-1.75rem)] z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/80 text-white shadow-lg shadow-black/60 transition hover:bg-black focus-visible:bg-black md:flex'

export function ShowRow<T>({
  id,
  title,
  items,
  itemKey,
  render,
  action,
  logo,
  viewAllHref,
}: {
  id?: string
  title: string
  items: T[]
  itemKey: (item: T) => string
  render: (item: T) => ReactNode
  action?: ReactNode
  /** Platform id; shows that platform's logo before the title. */
  logo?: string
  viewAllHref?: string
}) {
  const headingId = useId()
  const scroller = useRef<HTMLUListElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateEdges = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges, items.length])

  function scrollBy(direction: 1 | -1) {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' })
  }

  return (
    <section id={id} aria-labelledby={headingId} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {logo && <PlatformLogo id={logo} size={24} decorative />}
          <h2 id={headingId} className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {viewAllHref && (
            <Link
              to={viewAllHref}
              aria-label={`View all ${title}`}
              className="inline-flex min-h-11 items-center gap-0.5 rounded-md px-2 text-sm text-muted transition hover:text-white focus-visible:ring-2 focus-visible:ring-accent-hi sm:min-h-0 sm:px-0"
            >
              View all
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
      <div className="group/row relative">
        <ul
          ref={scroller}
          onScroll={updateEdges}
          className="no-scrollbar pointer-events-none -mx-2 -mb-40 flex snap-x snap-mandatory list-none gap-4 overflow-x-auto scroll-smooth scroll-px-2 px-2 pt-1 pb-40 sm:gap-5"
        >
          {items.map((item) => (
            <li key={itemKey(item)} className={`${itemClass} pointer-events-auto`}>
              {render(item)}
            </li>
          ))}
        </ul>
        {canLeft && (
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label={`Scroll ${title} left`}
            className={`${arrowClass} left-2`}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        )}
        {canRight && (
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label={`Scroll ${title} right`}
            className={`${arrowClass} right-2`}
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        )}
      </div>
    </section>
  )
}

export function ShowRowSkeleton({ title }: { title: string }) {
  return (
    <section className="space-y-3" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="h-7 w-40 animate-pulse rounded bg-panel-2" />
      <ul className="-mb-40 flex list-none gap-4 overflow-hidden pt-1 pb-40 sm:gap-5">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className={`${itemClass} animate-pulse`}>
            <div className="aspect-[3/4] rounded-xl bg-panel-2" />
            <div className="mt-2 h-3 w-3/4 rounded bg-panel-2" />
          </li>
        ))}
      </ul>
    </section>
  )
}
