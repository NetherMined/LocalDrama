import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SearchCategory, type Suggestion } from '../api'
import { showPath } from './ShowCard'
import { SearchIcon } from './icons'

const DEBOUNCE_MS = 150

type Option = { kind: 'show'; show: Suggestion } | { kind: 'search' }

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlight(text: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  if (tokens.length === 0) return text
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-transparent font-semibold text-white">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export function SearchBox() {
  const navigate = useNavigate()
  const listId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const requestId = useRef(0)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [categories, setCategories] = useState<SearchCategory[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const q = query.trim()

  useEffect(() => {
    const id = ++requestId.current
    if (q.length < 2) {
      setItems([])
      setCategories([])
      return
    }
    const timer = window.setTimeout(() => {
      api
        .suggest(q)
        .then((res) => {
          if (id !== requestId.current) return
          setItems(res.items)
          setCategories(res.categories)
        })
        .catch(() => {
          if (id !== requestId.current) return
          setItems([])
          setCategories([])
        })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [q])

  const panelOpen = open && q.length > 0
  const options: Option[] = q
    ? [...items.map((show): Option => ({ kind: 'show', show })), { kind: 'search' }]
    : []
  const activeIndex = active >= 0 && active < options.length ? active : -1

  function optionId(index: number) {
    return `${listId}-option-${index}`
  }

  function closePanel() {
    setOpen(false)
    setActive(-1)
  }

  function submitSearch() {
    if (!q) return
    closePanel()
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  function choose(option: Option) {
    if (option.kind === 'search') {
      submitSearch()
      return
    }
    closePanel()
    setQuery('')
    navigate(showPath(option.show))
  }

  function chooseCategory(category: SearchCategory) {
    closePanel()
    setQuery('')
    navigate(`/browse?tag=${encodeURIComponent(category.name)}`)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    submitSearch()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return
      e.preventDefault()
      setOpen(true)
      const last = options.length - 1
      if (e.key === 'ArrowDown') setActive(activeIndex >= last ? 0 : activeIndex + 1)
      else setActive(activeIndex <= 0 ? last : activeIndex - 1)
    } else if (e.key === 'Enter') {
      if (panelOpen && activeIndex >= 0) {
        e.preventDefault()
        choose(options[activeIndex])
      }
    } else if (e.key === 'Escape') {
      if (panelOpen) {
        e.preventDefault()
        closePanel()
      }
    }
  }

  function onBlur(e: FocusEvent<HTMLFormElement>) {
    if (!formRef.current?.contains(e.relatedTarget as Node | null)) closePanel()
  }

  return (
    <form
      ref={formRef}
      role="search"
      onSubmit={onSubmit}
      onBlur={onBlur}
      className="relative w-full min-w-0 sm:max-w-xl max-sm:focus-within:absolute max-sm:focus-within:left-4 max-sm:focus-within:w-[calc(100vw-2rem)] max-sm:focus-within:top-3 max-sm:focus-within:z-50"
    >
      <label htmlFor="site-search" className="sr-only">
        Search dramas
      </label>
      <input
        id="site-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => {
          if (q) setOpen(true)
        }}
        onKeyDown={onKeyDown}
        placeholder="Search dramas"
        autoComplete="off"
        role="combobox"
        aria-expanded={panelOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={panelOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        className="w-full rounded-md border border-transparent bg-white/10 py-2 pr-11 pl-4 text-sm text-white placeholder:text-muted outline-none transition focus:border-accent-hi focus:bg-black"
      />
      <button
        type="submit"
        aria-label="Search"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1.5 text-muted transition hover:text-white"
      >
        <SearchIcon className="h-4 w-4" />
      </button>
      {panelOpen && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-black/95 shadow-2xl shadow-black/70 backdrop-blur"
        >
          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-2.5">
              {categories.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => chooseCategory(category)}
                  className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/90 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                >
                  {category.name}
                  <span className="ml-1.5 text-muted">{category.count}</span>
                </button>
              ))}
            </div>
          )}
          <ul id={listId} role="listbox" aria-label="Search suggestions" className="py-1">
            {options.map((option, index) => {
              const isActive = index === activeIndex
              const common = {
                id: optionId(index),
                role: 'option',
                'aria-selected': isActive,
                onMouseEnter: () => setActive(index),
                onClick: () => choose(option),
                className: `flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`,
              } as const
              if (option.kind === 'search') {
                return (
                  <li key="search" {...common} className={`${common.className} text-muted`}>
                    <SearchIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">Search for “{q}”</span>
                  </li>
                )
              }
              const { show } = option
              const tag = show.tags[0]
              return (
                <li key={`${show.source ?? ''}:${show.bookId}`} {...common}>
                  {show.cover ? (
                    <img src={show.cover} alt="" loading="lazy" className="aspect-video w-20 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="aspect-video w-20 shrink-0 rounded bg-panel-2" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-white/85">{highlight(show.name, q)}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
                      {show.sourceName && (
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-rose-500 uppercase">
                          {show.sourceName}
                        </span>
                      )}
                      {tag && <span className="truncate">{tag}</span>}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </form>
  )
}
