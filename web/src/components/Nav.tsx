import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useStatus } from '../status'
import { useInstall } from '../install'
import { resetFavourites } from '../lib/favourites'
import { BottomTabs } from './BottomTabs'
import { InstallDialog } from './InstallDialog'
import { HistoryIcon, UserIcon, SearchIcon } from './icons'
import { NotificationsBell } from './NotificationsBell'
import { ProfileAvatar } from './ProfileAvatar'
import { SearchSheet } from './SearchSheet'
import { buttonClass } from './ui'

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
  const signedIn = !!status?.authenticated
  const pendingRequests = status?.pendingRequests ?? 0
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { installed, platform } = useInstall()
  // Android phones and Android TV sticks install the APK; other TVs have nothing to install.
  const androidDevice = /Android/i.test(navigator.userAgent)
  const showInstall = !installed && (androidDevice || platform !== 'tv')
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const overHero = location.pathname === '/' && !scrolled
  const profileId = status?.profile?.id

  useEffect(() => {
    resetFavourites(signedIn)
  }, [profileId, status?.account?.id, signedIn])

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
    resetFavourites(false)
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
    resetFavourites(false)
    try {
      await api.logout()
    } catch {
      // The session may already be gone; reloading status settles the state.
    }
    await reload()
    navigate('/login?reason=signed_out', { replace: true })
  }

  const links: NavLinkItem[] = [
    { label: 'Home', to: '/', active: location.pathname === '/' },
    { label: 'Categories', to: '/browse', active: location.pathname.startsWith('/browse') },
    ...(signedIn ? [{ label: 'My List', to: '/favourites', active: location.pathname.startsWith('/favourites') }] : []),
  ]
  const signInHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`

  return (
    <>
    <header
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        overHero ? 'bg-gradient-to-b from-black/80 via-black/40 to-transparent' : 'bg-ink/95 backdrop-blur'
      }`}
    >
      <div className="flex h-16 items-center gap-3 px-4 short:h-12 sm:gap-4 sm:px-6 lg:px-10">
        <Link to="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded">
          <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--color-accent)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--color-accent-hi)' }} />
              </linearGradient>
            </defs>
            <polygon points="8,6 26,16 8,26" fill="url(#logo-grad)" />
          </svg>
          <span className="bg-gradient-to-r from-accent-soft to-accent-text bg-clip-text text-lg font-black tracking-tight text-transparent sm:text-xl">
            Dramora
          </span>
        </Link>
        {status?.mock && (
          <span className="hidden rounded border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold tracking-wider text-amber-300 sm:inline-block">
            MOCK MODE
          </span>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search dramas"
          title="Search"
          className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
        >
          <SearchIcon className="h-5 w-5" />
        </button>
        {!signedIn && (
          <Link to={signInHref} className={`${buttonClass('primary')} h-10 shrink-0 px-3 sm:px-5`}>
            Sign in
          </Link>
        )}
        {signedIn && (
          <>
            <Link
              to="/history"
              aria-label="Continue watching"
              title="Continue watching"
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 sm:inline-flex"
            >
              <HistoryIcon className="h-5 w-5" />
            </Link>
            <NotificationsBell />
          </>
        )}
        {signedIn && <div ref={menuRef} className="relative shrink-0">
          <button
            ref={avatarRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={status?.profile ? `Profile: ${status.profile.name}` : 'Profile menu'}
            title={status?.profile?.name ?? 'Profile'}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:ring-2 hover:ring-white/60 focus-visible:ring-2 sm:h-10 sm:w-10"
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
              {showInstall && androidDevice && (
                <a
                  href="/dramora.apk"
                  download="Dramora.apk"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className={menuItemClass}
                >
                  Install app
                </a>
              )}
              {showInstall && !androidDevice && (
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
                <Link to="/admin/users" role="menuitem" onClick={() => setMenuOpen(false)} className={`${menuItemClass} justify-between`}>
                  Users
                  {pendingRequests > 0 && (
                    <span
                      aria-label={`${pendingRequests} pending access requests`}
                      className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white"
                    >
                      {pendingRequests}
                    </span>
                  )}
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
        </div>}
      </div>
      <nav
        aria-label="Main"
        className="no-scrollbar hidden h-12 items-center gap-6 overflow-x-auto px-4 text-sm font-bold short:h-9 short:text-xs sm:flex sm:px-6 lg:px-10"
      >
        {links.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            aria-current={item.active ? 'page' : undefined}
            className={`shrink-0 whitespace-nowrap transition ${
              item.active ? 'text-accent-text' : 'text-white hover:text-white/75'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
      {installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
      {searchOpen && <SearchSheet onClose={() => setSearchOpen(false)} />}
      <BottomTabs signedIn={signedIn} onSearch={() => setSearchOpen(true)} />
    </>
  )
}
