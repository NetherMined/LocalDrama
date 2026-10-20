import { useRef, useState } from 'react'
import { buttonClass } from './ui'

export function TempPasswordView({
  username,
  password,
  onDone,
}: {
  username: string
  password: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setHint(null)
      return
    } catch {
      // Clipboard API unavailable (insecure origin or permissions): select the text for a manual copy.
    }
    const input = passwordRef.current
    if (!input) return
    input.focus()
    input.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    setCopied(ok)
    setHint(ok ? null : 'Press Ctrl+C to copy the selected password.')
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Share these sign-in details with <span className="font-semibold text-white">{username}</span>.
      </p>
      <div>
        <p className="text-xs font-bold tracking-widest text-muted uppercase">Username</p>
        <p className="mt-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm break-all">{username}</p>
      </div>
      <div>
        <label htmlFor="temp-password" className="text-xs font-bold tracking-widest text-muted uppercase">
          Temporary password
        </label>
        <div className="mt-1 flex items-stretch gap-2">
          <input
            ref={passwordRef}
            id="temp-password"
            readOnly
            value={password}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-base tracking-wider outline-none focus:border-accent-hi"
          />
          <button type="button" onClick={() => void copy()} className={buttonClass('ghost')}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {hint && <p className="mt-2 text-xs text-amber-300">{hint}</p>}
      </div>
      <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
        Shown once. They&apos;ll be asked to change it when they first sign in.
      </p>
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className={buttonClass()}>
          Done
        </button>
      </div>
    </div>
  )
}
