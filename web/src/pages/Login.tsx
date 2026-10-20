import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { buttonClass } from '../components/ui'
import { errorMessage, safeNext } from '../lib/format'
import { useStatus } from '../status'

export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { status, reload } = useStatus()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status && (!status.authRequired || status.authenticated)) {
      navigate(next, { replace: true })
    }
  }, [status, next, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'register' && password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!password) return
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await api.login(password)
      } else {
        // First-time admin registration (server accepts if no password is set yet)
        await api.completeSetup({
          downloadRoot: '',
          language: 'en',
          password,
        })
      }
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
          <p className="text-3xl font-black tracking-tight text-rose-500">LOCALDRAMA</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h1>
        </div>

        <div className="flex rounded-lg bg-zinc-900 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md py-2 font-medium transition ${
              mode === 'login' ? 'bg-rose-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-md py-2 font-medium transition ${
              mode === 'register' ? 'bg-rose-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {mode === 'register' && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
              Email or username
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-rose-500"
              placeholder="you@example.com"
            />
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-rose-500"
          />
        </div>

        {mode === 'register' && (
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
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white outline-none focus:border-rose-500"
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
          disabled={submitting || !password}
          className="w-full rounded-md bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
        >
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <p className="text-center text-xs text-zinc-500">
          {mode === 'login'
            ? 'First time? Register to become the admin and finish setup.'
            : 'The first account becomes the main admin.'}
        </p>
      </form>
    </div>
  )
}
