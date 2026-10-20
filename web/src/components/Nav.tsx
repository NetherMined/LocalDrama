import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useDownloads } from '../downloads'
import { useStatus } from '../status'
import { GearIcon, UserIcon } from './icons'
import { ProfileAvatar } from './ProfileAvatar'
import { SearchBox } from './SearchBox'

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive ? 'text-white' : 'text-muted hover:text-white'
  }`
}

function iconLinkClass({ isActive }: { isActive: boolean }) {
  return `inline-flex h-10 w-10 items-center justify-center rounded-md transition ${
    isActive ? 'bg-panel-2 text-white' : 'text-muted hover:bg-panel-2 hover:text-white'
  }`
}

const menuItemClass =
  'flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-white/90 transition hover:bg-panel-2 hover:text-white focus-visible:bg-panel-2'

export function Nav() {
  const { status, reload } = useStatus()
  const { activeCount } = useDownloads()
  const navigate = useNavigate()
  const isAdmin = status?.profile?.isAdmin === true
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)

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
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link to="/" className="rounded text-xl font-extrabold tracking-tight text-rose-500">
          LOCALDRAMA
        </Link>
        {status?.mock && (
          <span className="rounded border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold tracking-wider text-amber-300">
            MOCK MODE
          </span>
        )}
        <nav aria-label="Main" className="flex items-center gap-1">
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/browse" className={navClass}>
            Browse
          </NavLink>
          <NavLink to="/favourites" className={navClass}>
            My Favourites
          </NavLink>
          <NavLink to="/downloads" className={navClass}>
            Downloads
            {activeCount > 0 && (
              <span
                aria-label={`${activeCount} active`}
                className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-bold text-white"
              >
                {activeCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/library" className={navClass}>
            Library
          </NavLink>
        </nav>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:min-w-64 sm:flex-none">
            <SearchBox />
          </div>
          {isAdmin && (
            <NavLink to="/settings" aria-label="Settings" title="Settings" className={iconLinkClass}>
              <GearIcon />
            </NavLink>
          )}
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
                {isAdmin && (
                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className={menuItemClass}
                  >
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
                    Log out
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
