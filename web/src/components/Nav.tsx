import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useStatus } from '../status'
import { useInstall } from '../install'
import { BottomTabs } from './BottomTabs'
import { InstallDialog } from './InstallDialog'
import { UserIcon } from './icons'
import { NotificationsBell } from './NotificationsBell'
import { ProfileAvatar } from './ProfileAvatar'
import { SearchBox } from './SearchBox'

const menuItemClass =
  'flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-white/90 transition hover:bg-panel-2 hover:text-white focus-visible:bg-panel-2'

interface NavLinkItem {
  label: string
  to: string
  active: boolean
}

export function Nav() {
  const { status, reload } = useStatus()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = status?.account?.role === 'admin'
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const { installed } = useInstall()
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        avatarRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function switchProfile() {
    setMenuOpen(false)
    try {
      await api.signoutProfile()
    } catch {
      // Fall through: the profile picker shows the current state either way.
    }
    await reload()
    navigate('/profiles', { replace: true })
  }

  async function logout() {
    setMenuOpen(false)
    setLoggingOut(true)
    try {
      await api.logout()
    } catch {
      // The session may already be gone; reloading status settles the state.
    }
    await reload()
    navigate('/login?reason=signed_out', { replace: true })
  }

  const popular = location.pathname === '/browse' && new URLSearchParams(location.search).get('sort') === 'popular'
  const links: NavLinkItem[] = [
    { label: 'Home', to: '/', active: location.pathname === '/' },
    { label: 'Browse', to: '/browse', active: location.pathname === '/browse' && !popular },
    { label: 'New & Popular', to: '/browse?sort=popular', active: popular },
    { label: 'My List', to: '/favourites', active: location.pathname === '/favourites' },
    { label: 'Library', to: '/library', active: location.pathname.startsWith('/library') },
    { label: 'Downloads', to: '/downloads', active: location.pathname === '/downloads' },
  ]

  return (
    <>
    <header
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        scrolled ? 'bg-black/95 backdrop-blur' : 'bg-gradient-to-b from-black/90 to-black/0'
      }`}
    >
      <div className="flex items-center gap-3 px-4 pt-3 sm:gap-4 sm:px-6 lg:px-10">
        <Link to="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded">
          <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7C3AED" />
                <stop offset="100%" stopColor="#C026D3" />
              </linearGradient>
            </defs>
            <polygon points="8,6 26,16 8,26" fill="url(#logo-grad)" />
          </svg>
          <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-lg font-black tracking-tight text-transparent sm:text-xl">
            Dramora
          </span>
        </Link>
        {status?.mock && (
          <span className="hidden rounded border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold tracking-wider text-amber-300 sm:inline-block">
            MOCK MODE
          </span>
        )}
        <div className="flex min-w-0 flex-1 justify-center">
          <SearchBox />
        </div>
        <NotificationsBell />
        <div ref={menuRef} className="relative shrink-0">
          <button
            ref={avatarRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={status?.profile ? `Profile: ${status.profile.name}` : 'Profile menu'}
            title={status?.profile?.name ?? 'Profile'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:ring-2 hover:ring-white/60 focus-visible:ring-2"
          >
            {status?.profile ? (
              <ProfileAvatar name={status.profile.name} color={status.profile.color} className="h-9 w-9 text-sm" />
            ) : (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-panel-2 text-muted">
                <UserIcon />
              </span>
            )}
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label="Profile"
              className="absolute right-0 z-50 mt-2 w-56 space-y-1 rounded-lg border border-line bg-panel p-2 shadow-2xl shadow-black/60"
            >
              {status?.profile && (
                <p className="truncate px-3 py-2 text-xs text-muted">
                  Signed in as <span className="font-semibold text-white">{status.profile.name}</span>
                </p>
              )}
              <button type="button" role="menuitem" onClick={() => void switchProfile()} className={menuItemClass}>
                Switch profile
              </button>
              <Link to="/account" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                Account
              </Link>
              {!installed && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setInstallOpen(true)
                  }}
                  className={menuItemClass}
                >
                  Install app
                </button>
              )}
              {isAdmin && (
                <Link to="/admin/users" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                  Users
                </Link>
              )}
              {isAdmin && (
                <Link to="/settings" role="menuitem" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                  Settings
                </Link>
              )}
              {status?.authRequired && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void logout()}
                  disabled={loggingOut}
                  className={menuItemClass}
                >
                  Sign out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <nav
        aria-label="Main"
        className="no-scrollbar hidden items-center gap-5 overflow-x-auto px-4 pt-2 pb-3 text-sm sm:flex sm:px-6 lg:px-10"
      >
        {links.filter((item) => isAdmin || item.to !== '/downloads').map((item) => (
          <Link
            key={item.label}
            to={item.to}
            aria-current={item.active ? 'page' : undefined}
            className={`shrink-0 whitespace-nowrap transition ${
              item.active ? 'font-semibold text-white' : 'text-white/70 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
      {installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
      <BottomTabs isAdmin={isAdmin} />
    </>
  )
}
