import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { api, type AdminAccount } from '../api'
import { errorMessage } from '../lib/format'
import { Modal } from './Modal'
import { TempPasswordView } from './TempPasswordView'
import { NoticeText, buttonClass, inputClass } from './ui'

export type Notify = (text: string, kind: 'ok' | 'err') => void

interface UserActionsProps {
  user: AdminAccount
  isSelf: boolean
  variant: 'menu' | 'buttons'
  onChanged: () => void
  onDeleted?: () => void
  onNotify: Notify
}

type Dialog = { kind: 'reset' } | { kind: 'delete' } | { kind: 'temp'; password: string } | null

interface Item {
  key: string
  label: string
  tone?: 'danger'
  to?: string
  onSelect?: () => void
}

const menuItemClass =
  'flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition hover:bg-panel-2 focus-visible:bg-panel-2'

export function UserActions({ user, isSelf, variant, onChanged, onDeleted, onNotify }: UserActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function perform(action: () => Promise<unknown>, success: string) {
    setMenuOpen(false)
    setBusy(true)
    try {
      await action()
      onNotify(success, 'ok')
      onChanged()
    } catch (err) {
      onNotify(errorMessage(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  const name = user.username
  const items: Item[] = isSelf
    ? [{ key: 'self', label: 'Change your password', to: '/account' }]
    : [
        { key: 'reset', label: 'Reset password', onSelect: () => openDialog({ kind: 'reset' }) },
        {
          key: 'role',
          label: user.role === 'admin' ? 'Make user' : 'Make admin',
          onSelect: () => {
            const role = user.role === 'admin' ? 'user' : 'admin'
            void perform(
              () => api.updateAdminUser(user.id, { role }),
              `${name} is now ${role === 'admin' ? 'an admin' : 'a user'}`,
            )
          },
        },
        {
          key: 'disabled',
          label: user.disabled ? 'Enable' : 'Disable',
          onSelect: () => {
            const disabled = !user.disabled
            void perform(
              () => api.updateAdminUser(user.id, { disabled }),
              disabled ? `${name} is disabled and signed out` : `${name} is enabled`,
            )
          },
        },
        { key: 'delete', label: 'Delete', tone: 'danger', onSelect: () => openDialog({ kind: 'delete' }) },
      ]

  function openDialog(next: Dialog) {
    setMenuOpen(false)
    setDialog(next)
  }

  function renderItem(item: Item, asMenu: boolean) {
    const toneClass = item.tone === 'danger' ? 'text-red-300' : 'text-white/90 hover:text-white'
    if (item.to) {
      return (
        <Link
          key={item.key}
          to={item.to}
          role={asMenu ? 'menuitem' : undefined}
          onClick={() => setMenuOpen(false)}
          className={`${asMenu ? menuItemClass : `${buttonClass('ghost')} min-h-11`} ${asMenu ? toneClass : ''}`}
        >
          {item.label}
        </Link>
      )
    }
    return (
      <button
        key={item.key}
        type="button"
        role={asMenu ? 'menuitem' : undefined}
        disabled={busy}
        onClick={item.onSelect}
        className={asMenu ? `${menuItemClass} ${toneClass}` : `${buttonClass(item.tone === 'danger' ? 'danger' : 'ghost')} ${toneClass}`}
      >
        {item.label}
      </button>
    )
  }

  let dialogNode: ReactNode = null
  if (dialog?.kind === 'reset') {
    dialogNode = (
      <ResetDialog
        user={user}
        returnFocusRef={variant === 'menu' ? buttonRef : undefined}
        onClose={() => setDialog(null)}
        onDone={(password) => {
          setDialog({ kind: 'temp', password })
          onChanged()
        }}
      />
    )
  } else if (dialog?.kind === 'temp') {
    dialogNode = (
      <Modal
        title="Temporary password"
        description="Reset complete. Their old password no longer works."
        onClose={() => setDialog(null)}
        returnFocusRef={variant === 'menu' ? buttonRef : undefined}
      >
        <TempPasswordView username={name} password={dialog.password} onDone={() => setDialog(null)} />
      </Modal>
    )
  } else if (dialog?.kind === 'delete') {
    dialogNode = (
      <DeleteDialog
        user={user}
        returnFocusRef={variant === 'menu' ? buttonRef : undefined}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null)
          onNotify(`${name} was deleted`, 'ok')
          if (onDeleted) onDeleted()
          else onChanged()
        }}
      />
    )
  }

  if (variant === 'buttons') {
    return (
      <>
        <div className="flex flex-wrap gap-2">{items.map((item) => renderItem(item, false))}</div>
        {dialogNode}
      </>
    )
  }

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Actions for ${name}`}
        disabled={busy}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg leading-none text-muted transition hover:bg-panel-2 hover:text-white focus-visible:bg-panel-2 disabled:opacity-40"
      >
        <span aria-hidden="true">&#8943;</span>
      </button>
      {menuOpen && (
        <div
          role="menu"
          aria-label={`Actions for ${name}`}
          className="absolute right-0 z-30 mt-1 w-52 space-y-1 rounded-lg border border-line bg-panel p-1.5 shadow-2xl shadow-black/60"
        >
          {items.map((item) => renderItem(item, true))}
        </div>
      )}
      {dialogNode}
    </div>
  )
}

function ResetDialog({
  user,
  onClose,
  onDone,
  returnFocusRef,
}: {
  user: AdminAccount
  onClose: () => void
  onDone: (password: string) => void
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.resetAdminUserPassword(user.id)
      onDone(res.tempPassword)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Reset password for ${user.username}?`}
      description="Their current password stops working and they are signed out everywhere. You will get a new temporary password to share."
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      {error && <NoticeText notice={{ kind: 'err', text: error }} />}
      <div className={`flex justify-end gap-2 ${error ? 'mt-4' : ''}`}>
        <button type="button" data-autofocus onClick={onClose} className={buttonClass('ghost')}>
          Cancel
        </button>
        <button type="button" onClick={() => void confirm()} disabled={busy} className={buttonClass()}>
          {busy ? 'Resetting...' : 'Reset password'}
        </button>
      </div>
    </Modal>
  )
}

function DeleteDialog({
  user,
  onClose,
  onDone,
  returnFocusRef,
}: {
  user: AdminAccount
  onClose: () => void
  onDone: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed === user.username

  async function confirm() {
    if (!matches) return
    setBusy(true)
    setError(null)
    try {
      await api.deleteAdminUser(user.id)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Delete ${user.username}?`}
      description="This removes the account, all of its profiles, watch history, favourites and devices. It cannot be undone."
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void confirm()
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="delete-confirm" className="text-sm font-semibold">
            Type <span className="font-mono text-accent-hi">{user.username}</span> to confirm
          </label>
          <input
            id="delete-confirm"
            data-autofocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
        </div>
        {error && <NoticeText notice={{ kind: 'err', text: error }} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass('ghost')}>
            Cancel
          </button>
          <button type="submit" disabled={!matches || busy} className={buttonClass()}>
            {busy ? 'Deleting...' : 'Delete user'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
