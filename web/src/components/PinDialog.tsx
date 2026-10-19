import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BackspaceIcon } from './icons'
import { buttonClass } from './ui'

const MIN_DIGITS = 4
const MAX_DIGITS = 6
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

interface Props {
  title: string
  onSubmit: (pin: string) => Promise<void>
  onClose: () => void
}

export function PinDialog({ title, onSubmit, onClose }: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(value: string) {
    if (busyRef.current || value.length < MIN_DIGITS) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPin('')
      inputRef.current?.focus()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function onChangeDigits(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, MAX_DIGITS)
    setError(null)
    setPin(digits)
    if (digits.length === MAX_DIGITS) void submit(digits)
  }

  function pressKey(digit: string) {
    if (busy || pin.length >= MAX_DIGITS) return
    onChangeDigits(pin + digit)
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault()
    void submit(pin)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xs rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/60"
      >
        <h2 id={titleId} className="text-center text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-center text-sm text-muted">Enter the PIN to continue.</p>

        <form onSubmit={onFormSubmit} className="mt-5 space-y-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label="PIN"
            aria-describedby={error ? `${titleId}-error` : undefined}
            aria-invalid={error ? true : undefined}
            value={pin}
            disabled={busy}
            maxLength={MAX_DIGITS}
            onChange={(e) => onChangeDigits(e.target.value)}
            className="w-full rounded-md border border-line bg-ink px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-accent-hi"
          />

          {error && (
            <p id={`${titleId}-error`} role="alert" className="text-center text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-3" role="group" aria-label="PIN keypad">
            {KEYS.map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => pressKey(digit)}
                disabled={busy}
                className="h-14 rounded-xl border border-line bg-panel-2 text-xl font-semibold transition hover:bg-line disabled:opacity-40"
              >
                {digit}
              </button>
            ))}
            <span aria-hidden="true" />
            <button
              type="button"
              onClick={() => pressKey('0')}
              disabled={busy}
              className="h-14 rounded-xl border border-line bg-panel-2 text-xl font-semibold transition hover:bg-line disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setPin((p) => p.slice(0, -1))
              }}
              disabled={busy || pin.length === 0}
              aria-label="Delete last digit"
              className="flex h-14 items-center justify-center rounded-xl border border-line bg-panel-2 transition hover:bg-line disabled:opacity-40"
            >
              <BackspaceIcon />
            </button>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={`${buttonClass('ghost')} flex-1`}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || pin.length < MIN_DIGITS}
              className={`${buttonClass()} flex-1`}
            >
              {busy ? 'Checking...' : 'Enter'}
            </button>
          </div>
          <p className="text-center text-xs text-muted">PINs are 4 to 6 digits.</p>
        </form>
      </div>
    </div>
  )
}
