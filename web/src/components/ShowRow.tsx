import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

const arrowClass =
  'absolute top-24 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-ink/85 text-white shadow-lg shadow-black/50 backdrop-blur transition hover:bg-panel-2 focus-visible:outline-offset-2 [@media(any-hover:hover)]:flex sm:top-30'

export function ShowRow<T>({
  title,
  items,
  itemKey,
  render,
}: {
  title: string
  items: T[]
  itemKey: (item: T) => string
  render: (item: T) => ReactNode
}) {
  const headingId = useId()
  const scroller = useRef<HTMLUListElement>(null)

  function scrollBy(direction: 1 | -1) {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-lg font-semibold tracking-tight sm:text-xl">
        {title}
      </h2>
      <div className="group relative">
        <ul
          ref={scroller}
          className="no-scrollbar flex snap-x snap-mandatory list-none gap-4 overflow-x-auto scroll-smooth px-1 py-1"
        >
          {items.map((item) => (
            <li key={itemKey(item)} className="w-[150px] shrink-0 snap-start sm:w-[180px]">
              {render(item)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label={`Scroll ${title} left`}
          className={`${arrowClass} left-0 -translate-x-1/2`}
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label={`Scroll ${title} right`}
          className={`${arrowClass} right-0 translate-x-1/2`}
        >
          <ChevronRightIcon />
        </button>
      </div>
    </section>
  )
}

export function ShowRowSkeleton({ title }: { title: string }) {
  return (
    <section className="space-y-3" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="h-6 w-40 animate-pulse rounded bg-panel-2" />
      <ul className="flex list-none gap-4 overflow-hidden px-1 py-1">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="w-[150px] shrink-0 animate-pulse sm:w-[180px]">
            <div className="aspect-[3/4] rounded-md bg-panel-2" />
            <div className="mt-2 h-3 w-3/4 rounded bg-panel-2" />
          </li>
        ))}
      </ul>
    </section>
  )
}
