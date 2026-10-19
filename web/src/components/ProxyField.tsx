import { useEffect, useState } from 'react'
import { api, type ProxyTest } from '../api'
import { errorMessage } from '../lib/format'
import { buttonClass } from './ui'

interface Props {
  id?: string
  value: string
  onChange: (value: string) => void
  onResult?: (result: ProxyTest | null) => void
  testable?: boolean
  untestableHint?: string
}

export function ProxyField({ id = 'proxy', value, onChange, onResult, testable = true, untestableHint }: Props) {
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ tested: string; result?: ProxyTest; error?: string } | null>(null)

  const trimmed = value.trim()
  const matched = test && test.tested === trimmed ? test : null
  const result = matched?.result ?? null

  useEffect(() => {
    onResult?.(result)
    // onResult is intentionally left out: callers pass a fresh inline function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  async function run() {
    setTesting(true)
    setTest(null)
    try {
      const res = await api.testProxy(trimmed)
      setTest({ tested: trimmed, result: res })
    } catch (err) {
      setTest({ tested: trimmed, error: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="http://user:pass@host:port or socks5://host:port"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm outline-none focus:border-accent-hi"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={testing || !testable}
          title={!testable ? untestableHint : undefined}
          className={buttonClass('ghost')}
        >
          {testing ? 'Testing...' : 'Test connection'}
        </button>
      </div>
      {!testable && untestableHint && <p className="mt-2 text-xs text-muted">{untestableHint}</p>}

      {matched?.error && (
        <p role="alert" className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {matched.error}
        </p>
      )}
      {result && (
        <div role="status" className="mt-4 space-y-2 text-sm">
          <p className="text-muted">
            Egress IP:{' '}
            <span className="font-mono text-white">
              {result.ip ?? 'unknown'}
              {result.country ? ` (${result.country})` : ''}
            </span>
          </p>
          {result.apiOk ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-200">
              Dramabox API reachable
            </p>
          ) : (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-200">
              {result.error ?? 'Dramabox API is not reachable through this connection.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
