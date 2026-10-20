import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Suggestion } from '../api'
import { SearchIcon } from './icons'

export function SearchBox() {
  const navigate = useNavigate()
  const listId = useId()
  const wrapRef = useRef<HTMLFormElement>(null)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setItems([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      api
        .suggest(q)
        .then((res) => {
          if (!cancelled) setItems(res.items)
        })
        .catch(() => {
          if (!cancelled) setItems([])
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setOpen(false)
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  const showList = open && items.length > 0

  return (
    <form ref={wrapRef} role="search" onSubmit={submit} className="relative w-full max-w-xl">
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
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Search dramas"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className="w-full rounded-md border border-transparent bg-white/10 py-2 pr-11 pl-4 text-sm text-white placeholder:text-muted outline-none transition focus:border-accent-hi focus:bg-black"
      />
      <button
        type="submit"
        aria-label="Search"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1.5 text-muted transition hover:text-white"
      >
        <SearchIcon className="h-4 w-4" />
      </button>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-line bg-panel shadow-2xl shadow-black/60"
        >
          {items.map((s) => (
            <li key={s.bookId} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setQuery('')
                  navigate(`/show/${encodeURIComponent(s.bookId)}`)
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-panel-2 focus-visible:bg-panel-2"
              >
                {s.cover ? (
                  <img src={s.cover} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-9 shrink-0 rounded bg-panel-2" aria-hidden="true" />
                )}
                <span className="line-clamp-2">{s.name}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="submit"
              className="w-full px-3 py-2 text-left text-xs text-muted hover:bg-panel-2 focus-visible:bg-panel-2"
            >
              See all results for "{query.trim()}"
            </button>
          </li>
        </ul>
      )}
    </form>
  )
}
