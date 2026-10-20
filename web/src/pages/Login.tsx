import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { errorMessage, safeNext } from '../lib/format'
import { useStatus } from '../status'

const inputClass =
  'mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-rose-500'

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

  useEffect(() => {
    if (status?.authenticated) navigate(next, { replace: true })
  }, [status, next, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) return
    setSubmitting(true)
    try {
      await api.login(username.trim(), password)
      const fresh = await reload()
      navigate(fresh?.profileRequired ? `/profiles?next=${encodeURIComponent(next)}` : next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-rose-900/20 via-transparent to-transparent" />
      <form
        onSubmit={(e) => void submit(e)}
        className="relative z-10 w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-black/70 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="text-center">
          <p className="text-3xl font-black tracking-tight text-rose-500">DRAMAUS</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Sign in</h1>
        </div>

        {defaultCredentials && (
          <p role="note" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-white/90">
            First sign-in: username <strong>Admin</strong>, password <strong>12345</strong>. You'll be asked to
            choose a new password straight away.
          </p>
        )}

        {reasonText && !error && (
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
          className="w-full rounded-md bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
        >
          {submitting ? 'Please wait…' : 'Sign in'}
        </button>

        <p className="text-center text-xs text-zinc-500">
          Use the username and password your admin gave you. Ask an admin if you do not have an account.
        </p>
      </form>
    </div>
  )
}
