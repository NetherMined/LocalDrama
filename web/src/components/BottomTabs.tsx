import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookmarkIcon, GridIcon, HomeIcon, SearchIcon } from './icons'

const GRID_COLS = ['', '', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5']

const HIDDEN_PATHS = ['/login', '/setup', '/change-password', '/profiles']

function useFullscreenActive(): boolean {
  const [active, setActive] = useState(() => document.fullscreenElement !== null)
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  return active
}

const tabBase =
  'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-[11px] font-medium transition'

export function BottomTabs({ signedIn, onSearch }: { signedIn: boolean; onSearch: () => void }) {
  const location = useLocation()
  const fullscreen = useFullscreenActive()
  const { pathname } = location
  const hidden = fullscreen || HIDDEN_PATHS.includes(pathname)
  if (hidden) return null

  const popular = pathname === '/browse' && new URLSearchParams(location.search).get('sort') === 'popular'

  function openSearch(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    onSearch()
  }

  const tabs = [
    { label: 'Home', to: '/', icon: <HomeIcon className="h-6 w-6" />, active: pathname === '/' },
    { label: 'Browse', to: '/browse', icon: <GridIcon className="h-6 w-6" />, active: pathname === '/browse' && !popular },
    { label: 'Search', to: '/search', icon: <SearchIcon className="h-6 w-6" />, active: pathname === '/search', onClick: openSearch },
    ...(signedIn
      ? [{ label: 'My List', to: '/favourites', icon: <BookmarkIcon className="h-6 w-6" />, active: pathname === '/favourites' }]
      : []),
  ]

  return (
    <nav
      aria-label="Main tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden short:hidden"
    >
      <ul className={`grid ${GRID_COLS[tabs.length]}`}>
        {tabs.map((tab) => (
          <li key={tab.label}>
            <Link
              to={tab.to}
              onClick={tab.onClick}
              aria-current={tab.active ? 'page' : undefined}
              className={`${tabBase} ${tab.active ? 'text-white' : 'text-white/60 hover:text-white'}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
