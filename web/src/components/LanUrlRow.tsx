import { useRef, useState } from 'react'
import { buttonClass } from './ui'

export function LanUrlRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      inputRef.current?.select()
    }
  }

  return (
    <li className="flex flex-col gap-2 sm:flex-row">
      <input
        ref={inputRef}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`LAN address ${url}`}
        className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm text-white outline-none focus:border-accent-hi"
      />
      <button type="button" onClick={() => void copy()} className={buttonClass('ghost')}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </li>
  )
}
