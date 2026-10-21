import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { errorMessage } from '../lib/format'
import { useStatus } from '../status'

const inputClass =
  'mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-accent-hi'

export function ChangePassword() {
  const navigate = useNavigate()
  const { status, reload } = useStatus()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (next.length < 8) {
      setError('Use at least 8 characters')
      return
    }
    if (next !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await api.changePassword(current, next)
      await reload()
      navigate('/account', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  async function signOut() {
    try {
      await api.logout()
    } catch {
      // The session may already be gone; reloading status settles the state.
    }
    await reload()
    navigate('/login?reason=signed_out', { replace: true })
  }

  return (
    <div className="relative flex min-h-[70vh] items-center justify-center px-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">Set a new password</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {status?.account ? `Hi ${status.account.username}. ` : ''}Your password is temporary. Choose your own to continue.
          </p>
        </div>

        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-zinc-300">
            Temporary password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-zinc-300">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="confirm-new-password" className="block text-sm font-medium text-zinc-300">
            Confirm new password
          </label>
          <input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !current || !next || !confirm}
          className="w-full rounded-md bg-gradient-to-r from-accent to-accent-hi py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save new password'}
        </button>

        <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs text-zinc-500 hover:text-white">
          Sign out
        </button>
      </form>
    </div>
  )
}
