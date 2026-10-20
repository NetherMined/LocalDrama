import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookmarkIcon, DownloadIcon, GridIcon, HomeIcon, LibraryIcon, SearchIcon } from './icons'

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

export function BottomTabs({ isAdmin }: { isAdmin: boolean }) {
  const location = useLocation()
  const fullscreen = useFullscreenActive()
  const { pathname } = location
  const hidden = fullscreen || pathname.startsWith('/watch/') || HIDDEN_PATHS.includes(pathname)
  if (hidden) return null

  const popular = pathname === '/browse' && new URLSearchParams(location.search).get('sort') === 'popular'

  function focusSearch(event: MouseEvent<HTMLAnchorElement>) {
    const input = document.getElementById('site-search')
    if (!input) return
    event.preventDefault()
    window.scrollTo({ top: 0 })
    input.focus()
  }

  const tabs = [
    { label: 'Home', to: '/', icon: <HomeIcon className="h-6 w-6" />, active: pathname === '/' },
    { label: 'Browse', to: '/browse', icon: <GridIcon className="h-6 w-6" />, active: pathname === '/browse' && !popular },
    { label: 'Search', to: '/search', icon: <SearchIcon className="h-6 w-6" />, active: pathname === '/search', onClick: focusSearch },
    { label: 'My List', to: '/favourites', icon: <BookmarkIcon className="h-6 w-6" />, active: pathname === '/favourites' },
    isAdmin
      ? { label: 'Downloads', to: '/downloads', icon: <DownloadIcon className="h-6 w-6" />, active: pathname === '/downloads' }
      : { label: 'Library', to: '/library', icon: <LibraryIcon className="h-6 w-6" />, active: pathname.startsWith('/library') },
  ]

  return (
    <nav
      aria-label="Main tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="grid grid-cols-5">
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
