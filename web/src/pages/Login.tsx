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
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status && (!status.authRequired || status.authenticated)) {
      navigate(next, { replace: true })
    }
  }, [status, next, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!password) return
    setSubmitting(true)
    setError(null)
    try {
      await api.login(password)
      await reload()
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-5 rounded-xl border border-line bg-panel p-6 sm:p-8">
        <div>
          <p className="text-sm font-semibold tracking-widest text-accent-hi uppercase">Dramabox</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Enter the admin password to continue.</p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent-hi"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting || !password} className={`${buttonClass()} w-full`}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
