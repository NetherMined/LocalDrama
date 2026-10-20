import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { errorMessage, safeNext } from '../lib/format'
import { useStatus } from '../status'

const inputClass =
  'mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-rose-500'

export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { status, reload } = useStatus()
  const bootstrap = status?.needsBootstrap === true
  const [username, setUsername] = useState(bootstrap ? 'admin' : '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status?.authenticated) navigate(next, { replace: true })
  }, [status, next, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) return
    if (bootstrap) {
      if (password.length < 8) {
        setError('Use at least 8 characters')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match')
        return
      }
    }
    setSubmitting(true)
    try {
      if (bootstrap) await api.bootstrap(username.trim(), password)
      else await api.login(username.trim(), password)
      await reload()
      navigate(next, { replace: true })
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
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {bootstrap ? 'Create the admin password' : 'Sign In'}
          </h1>
        </div>

        <div>
          <label htmlFor="username" className="block text-sm font-medium text-zinc-300">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus={!bootstrap}
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
            autoComplete={bootstrap ? 'new-password' : 'current-password'}
            autoFocus={bootstrap}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {bootstrap && (
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-zinc-300">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

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
          {submitting ? 'Please wait…' : bootstrap ? 'Create admin password' : 'Sign In'}
        </button>

        <p className="text-center text-xs text-zinc-500">
          {bootstrap
            ? 'This server has no admin password yet. The first password you set protects the admin account.'
            : 'Ask an admin if you do not have an account.'}
        </p>
      </form>
    </div>
  )
}
