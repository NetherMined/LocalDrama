import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { RequestAccessDialog } from '../components/RequestAccessDialog'
import { buttonClass } from '../components/ui'
import { errorMessage, safeNext } from '../lib/format'
import { useStatus } from '../status'

const inputClass =
  'mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-accent-hi'

const PENDING_MESSAGE = 'Your access request is waiting for an admin to approve it'

const REASON_TEXT: Record<string, string> = {
  expired: 'Session expired. Sign in again to continue.',
  signed_out: 'You have been signed out.',
}

export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const reason = params.get('reason')
  const reasonText = REASON_TEXT[reason ?? ''] ?? null
  const { status, reload } = useStatus()
  const defaultCredentials = status?.defaultCredentials === true
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const requestRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (status?.authenticated) navigate(next, { replace: true })
  }, [status, next, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(false)
    if (!username.trim() || !password) return
    setSubmitting(true)
    try {
      await api.login(username.trim(), password)
      const fresh = await reload()
      navigate(fresh?.profileRequired ? `/profiles?next=${encodeURIComponent(next)}` : next, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message === PENDING_MESSAGE) setPending(true)
      else setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent" />
      <form
        onSubmit={(e) => void submit(e)}
        className="relative z-10 w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="text-center">
          <p className="bg-gradient-to-r from-accent-soft to-accent-text bg-clip-text text-3xl font-black tracking-tight text-transparent">Dramora</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Sign in</h1>
        </div>

        {defaultCredentials && (
          <p role="note" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-white/90">
            First sign-in: username <strong>Admin</strong>, password <strong>12345</strong>. You'll be asked to
            choose a new password straight away.
          </p>
        )}

        {pending && (
          <p role="status" className="rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-white/90">
            {PENDING_MESSAGE}. You can sign in once it is approved.
          </p>
        )}

        {reasonText && !error && !pending && (
          <p role="status" className="rounded-md bg-white/10 px-3 py-2 text-sm text-white/90">
            {reasonText}
          </p>
        )}

        <div>
          <label htmlFor="username" className="block text-sm font-medium text-zinc-300">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          disabled={submitting || !username.trim() || !password}
          className="w-full rounded-md bg-gradient-to-r from-accent to-accent-hi py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? 'Please wait…' : 'Sign in'}
        </button>

        <button
          ref={requestRef}
          type="button"
          onClick={() => setRequestOpen(true)}
          className={`${buttonClass('ghost')} w-full`}
        >
          Request access
        </button>

        <p className="text-center text-xs text-zinc-500">No account? Request access and an admin will approve it.</p>
      </form>
      {requestOpen && <RequestAccessDialog onClose={() => setRequestOpen(false)} returnFocusRef={requestRef} />}
    </div>
  )
}
