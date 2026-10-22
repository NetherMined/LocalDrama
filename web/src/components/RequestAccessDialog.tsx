import { useState, type FormEvent, type RefObject } from 'react'
import { api } from '../api'
import { errorMessage } from '../lib/format'
import { Modal } from './Modal'
import { buttonClass, inputClass, NoticeText } from './ui'

const MIN_PASSWORD_LENGTH = 8
const MAX_NOTE_LENGTH = 300

export function RequestAccessDialog({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim()) {
      setError('Choose a username.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api.requestAccess({ username: username.trim(), password, note: note.trim() || undefined })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Request access"
      description="An admin reviews every request before the account can sign in."
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      {sent ? (
        <div className="space-y-5">
          <p role="status" className="rounded-md bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
            Request sent. You can sign in once an admin approves it.
          </p>
          <div className="flex justify-end">
            <button type="button" data-autofocus onClick={onClose} className={buttonClass()}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <label htmlFor="request-username" className="text-sm font-semibold">
              Username
            </label>
            <input
              id="request-username"
              data-autofocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="request-password" className="text-sm font-semibold">
              Password
            </label>
            <input
              id="request-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="request-password-hint"
              className={inputClass}
            />
            <p id="request-password-hint" className="mt-1.5 text-xs text-muted">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div>
            <label htmlFor="request-confirm" className="text-sm font-semibold">
              Confirm password
            </label>
            <input
              id="request-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="request-note" className="text-sm font-semibold">
              Note <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="request-note"
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              placeholder="Who are you?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputClass} resize-y`}
            />
            <p className="mt-1 text-right text-xs text-muted tabular-nums">
              {note.length}/{MAX_NOTE_LENGTH}
            </p>
          </div>
          {error && <NoticeText notice={{ kind: 'err', text: error }} />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className={buttonClass('ghost')}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={buttonClass()}>
              {busy ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
