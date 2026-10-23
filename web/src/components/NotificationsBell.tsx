import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useEvents, type AppNotification } from '../api'
import { errorMessage, fmtAgo } from '../lib/format'
import { BellIcon } from './icons'

const REFRESH_MS = 60_000
const MARK_READ_DELAY_MS = 1500

const rowClass = 'flex items-start gap-3 rounded-md px-3 py-2.5 transition hover:bg-panel-2'

function linkFor(n: AppNotification): string | null {
  if (n.link) return n.link
  if (n.kind === 'welcome' || n.kind === 'password_reset') return '/account'
  if (n.kind === 'new_device') return '/account#devices'
  return null
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const refreshCount = useCallback(() => {
    api
      .account()
      .then((res) => setUnread(res.unread))
      .catch(() => undefined)
  }, [])

  const loadList = useCallback(async () => {
    try {
      const res = await api.notifications()
      setItems(res.items)
      setUnread(res.unread)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    refreshCount()
    const id = window.setInterval(refreshCount, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refreshCount])

  useEvents((event) => {
    if (event.type !== 'notification') return
    refreshCount()
    if (openRef.current) void loadList()
  })

  useEffect(() => {
    if (open) void loadList()
  }, [open, loadList])

  // Visible unread notifications count as read once the panel has been open for a moment.
  useEffect(() => {
    if (!open || !items) return
    const ids = items.filter((n) => n.readAt === null).map((n) => n.id)
    if (ids.length === 0) return
    const id = window.setTimeout(() => {
      api
        .markNotificationsRead(ids)
        .then((res) => {
          const now = new Date().toISOString()
          setUnread(res.unread)
          setItems((prev) => prev?.map((n) => (ids.includes(n.id) ? { ...n, readAt: now } : n)) ?? prev)
        })
        .catch(() => undefined)
    }, MARK_READ_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [open, items])

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function markAll() {
    setMarkingAll(true)
    try {
      const res = await api.markNotificationsRead()
      const now = new Date().toISOString()
      setUnread(res.unread)
      setItems((prev) => prev?.map((n) => (n.readAt === null ? { ...n, readAt: now } : n)) ?? prev)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setMarkingAll(false)
    }
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-controls="notifications-panel"
        title="Notifications"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-hi px-1 text-[10px] leading-none font-bold text-white ring-2 ring-black"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notifications-panel"
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-5rem))] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={markingAll || unread === 0}
              className="text-xs font-semibold text-accent-text transition hover:text-white disabled:text-muted disabled:opacity-60"
            >
              Mark all read
            </button>
          </div>

          <div className="overflow-y-auto p-2">
            {error && (
              <p role="alert" className="px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            {items === null && !error && <p className="px-3 py-4 text-sm text-muted">Loading…</p>}

            {items !== null && items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>
            )}

            {items !== null && items.length > 0 && (
              <ul className="space-y-0.5">
                {items.map((n) => (
                  <NotificationRow key={n.id} notification={n} onOpen={() => setOpen(false)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ notification: n, onOpen }: { notification: AppNotification; onOpen: () => void }) {
  const unread = n.readAt === null
  const to = linkFor(n)
  const content = (
    <>
      <span
        aria-label={unread ? 'Unread' : undefined}
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-accent-hi' : 'bg-transparent'}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${unread ? 'font-semibold text-white' : 'text-white/80'}`}>{n.title}</span>
        {n.body && <span className="mt-0.5 block text-xs text-muted">{n.body}</span>}
        <span className="mt-1 block text-[11px] text-muted">{fmtAgo(n.createdAt)}</span>
      </span>
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} onClick={onOpen} className={`${rowClass} w-full`}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  )
}
