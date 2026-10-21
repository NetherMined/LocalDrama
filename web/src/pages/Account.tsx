import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type Device, type Show } from '../api'
import { ShowCard, showGridClass } from '../components/ShowCard'
import { EmptyState, NoticeText, Section, buttonClass, inputClass, type Notice } from '../components/ui'
import { errorMessage, fmtAgo } from '../lib/format'
import { useStatus } from '../status'

export function Account() {
  const { status } = useStatus()
  const location = useLocation()
  const account = status?.account
  const isAdmin = account?.role === 'admin'

  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight break-all sm:text-3xl">{account?.username ?? 'Account'}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase ${
            isAdmin ? 'bg-accent/20 text-accent-hi' : 'bg-white/10 text-white/80'
          }`}
        >
          {isAdmin ? 'Admin' : 'User'}
        </span>
      </header>

      <PasswordCard />
      <FavouritesCard profileName={status?.profile?.name ?? null} />
      <div id="devices" className="scroll-mt-24">
        <DevicesCard />
      </div>

      <Section id="profiles" title="Profiles" description="Each profile keeps its own favourites and watch progress.">
        <Link to="/profiles" className={`${buttonClass('ghost')} min-h-11`}>
          Manage profiles
        </Link>
      </Section>
    </div>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    if (next.length < 8) {
      setNotice({ kind: 'err', text: 'Use at least 8 characters.' })
      return
    }
    if (next !== confirm) {
      setNotice({ kind: 'err', text: 'The new passwords do not match.' })
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setNotice({ kind: 'ok', text: 'Password changed. Other devices were signed out.' })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="password" title="Change password" description="Use at least 8 characters.">
      <form onSubmit={(e) => void submit(e)} className="max-w-md space-y-4">
        <div>
          <label htmlFor="pw-current" className="block text-sm font-medium">
            Current password
          </label>
          <input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="pw-next" className="block text-sm font-medium">
            New password
          </label>
          <input
            id="pw-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="pw-confirm" className="block text-sm font-medium">
            Confirm new password
          </label>
          <input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>
        {notice && <NoticeText notice={notice} />}
        <button type="submit" disabled={busy || !current || !next || !confirm} className={buttonClass()}>
          {busy ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </Section>
  )
}

function FavouritesCard({ profileName }: { profileName: string | null }) {
  const [items, setItems] = useState<Show[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .favourites()
      .then((res) => {
        if (!cancelled) setItems(res.items)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Optimistic: the card leaves at once and comes back if the server refuses.
  function remove(show: Show) {
    const previous = items
    setItems((list) => list?.filter((s) => s.bookId !== show.bookId) ?? list)
    setError(null)
    api.removeFavourite(show.bookId).catch((err) => {
      setItems(previous)
      setError(`Could not remove ${show.name}: ${errorMessage(err)}`)
    })
  }

  return (
    <Section
      id="favourites"
      title="Favourites"
      description={profileName ? `Favourites for ${profileName}.` : 'Favourites for the current profile.'}
    >
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <Link to="/profiles" className="inline-flex min-h-11 items-center font-semibold text-accent-hi hover:text-white">
          Switch profile
        </Link>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {items === null && !error && <p className="text-sm text-muted">Loading...</p>}

      {items !== null && items.length === 0 && (
        <EmptyState title="No favourites yet">
          <Link to="/browse" className="font-semibold text-accent-hi hover:text-white">
            Browse dramas
          </Link>{' '}
          and tap Add to Favourites on any show.
        </EmptyState>
      )}

      {items !== null && items.length > 0 && (
        <ul className={`${showGridClass} list-none`}>
          {items.map((show) => (
            <li key={show.bookId} className="relative">
              <ShowCard show={show} />
              <button
                type="button"
                onClick={() => remove(show)}
                aria-label={`Remove ${show.name} from favourites`}
                title="Remove from favourites"
                className="absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/85 text-base leading-none text-white ring-1 ring-white/30 transition hover:bg-rose-600"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function DevicesCard() {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.devices()
      setDevices(res.items)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function signOutDevice(device: Device) {
    setBusy(true)
    setError(null)
    try {
      await api.removeDevice(device.id)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function signOutOthers() {
    const others = (devices ?? []).filter((d) => !d.current)
    if (others.length === 0) return
    setBusy(true)
    setError(null)
    const results = await Promise.allSettled(others.map((d) => api.removeDevice(d.id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    await load()
    if (failed > 0) setError(`${failed} device${failed === 1 ? '' : 's'} could not be signed out. Try again.`)
    setBusy(false)
  }

  const others = devices?.filter((d) => !d.current).length ?? 0

  return (
    <Section id="devices" title="Devices" description="Browsers and devices that are signed in to this account.">
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {devices === null && !error && <p className="text-sm text-muted">Loading...</p>}

      {devices !== null && devices.length === 0 && <p className="text-sm text-muted">No devices are signed in.</p>}

      {devices !== null && devices.length > 0 && (
        <ul className="divide-y divide-line">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="break-words">{d.name || 'Unknown device'}</span>
                  {d.current && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-hi">
                      This device
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {d.ip || 'Unknown address'} · Last seen {fmtAgo(d.lastSeenAt)}
                </p>
              </div>
              {!d.current && (
                <button
                  type="button"
                  onClick={() => void signOutDevice(d)}
                  disabled={busy}
                  className={buttonClass('ghost')}
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {devices !== null && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => void signOutOthers()}
            disabled={busy || others === 0}
            className={buttonClass('danger')}
          >
            Sign out everywhere else
          </button>
        </div>
      )}
    </Section>
  )
}
