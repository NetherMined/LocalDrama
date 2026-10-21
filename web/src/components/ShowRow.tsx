import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

const arrowClass =
  'absolute inset-y-0 z-10 hidden w-12 items-center justify-center text-white opacity-0 transition duration-200 group-hover/row:opacity-100 focus-visible:opacity-100 md:flex'

export function ShowRow<T>({
  id,
  title,
  items,
  itemKey,
  render,
  action,
}: {
  id?: string
  title: string
  items: T[]
  itemKey: (item: T) => string
  render: (item: T) => ReactNode
  action?: ReactNode
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
        <h2 id={headingId} className="text-lg font-bold tracking-tight text-white sm:text-xl">
          {title}
        </h2>
        {action}
      </div>
      <div className="group/row relative">
        <ul
          ref={scroller}
          onScroll={updateEdges}
          className="no-scrollbar flex snap-x snap-mandatory list-none gap-3 overflow-x-auto scroll-smooth py-1"
        >
          {items.map((item) => (
            <li key={itemKey(item)} className="w-[260px] shrink-0 snap-start sm:w-[280px]">
              {render(item)}
            </li>
          ))}
        </ul>
        {canLeft && (
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label={`Scroll ${title} left`}
            className={`${arrowClass} left-0 bg-gradient-to-r from-black/80 to-transparent`}
          >
            <ChevronLeftIcon className="h-9 w-9" />
          </button>
        )}
        {canRight && (
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label={`Scroll ${title} right`}
            className={`${arrowClass} right-0 bg-gradient-to-l from-black/80 to-transparent`}
          >
            <ChevronRightIcon className="h-9 w-9" />
          </button>
        )}
      </div>
    </section>
  )
}

export function ShowRowSkeleton({ title }: { title: string }) {
  return (
    <section className="space-y-3" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="h-6 w-40 animate-pulse rounded bg-panel-2" />
      <ul className="flex list-none gap-3 overflow-hidden py-1">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="w-[260px] shrink-0 animate-pulse sm:w-[280px]">
            <div className="aspect-video rounded-md bg-panel-2" />
            <div className="mt-2 h-3 w-3/4 rounded bg-panel-2" />
          </li>
        ))}
      </ul>
    </section>
  )
}
