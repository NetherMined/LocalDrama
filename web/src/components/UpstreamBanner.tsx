import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isRegionBlocked } from '../lib/format'
import { useStatus } from '../status'

const DISMISS_KEY = 'dbx-upstream-dismissed'
const MAX_TEXT = 200

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Storage can be blocked; the banner then simply reappears on reload.
  }
}

export function UpstreamBanner() {
  const { status } = useStatus()
  const [dismissed, setDismissed] = useState(readDismissed)
  const upstream = status?.upstream

  if (!upstream || upstream.ok !== false || dismissed) return null

  const error = upstream.error?.trim() || 'The Dramabox API is not responding.'
  const text = error.length > MAX_TEXT ? `${error.slice(0, MAX_TEXT)}...` : error
  const blocked = isRegionBlocked(error)

  return (
    <div role="alert" className="border-b border-amber-400/30 bg-amber-400/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
        <p className="min-w-0 flex-1 break-words text-amber-100">
          <span className="font-semibold text-amber-300">Dramabox API unreachable. </span>
          {text}
        </p>
        {blocked && (
          <Link
            to="/settings"
            className="rounded font-semibold text-amber-300 underline underline-offset-4 hover:text-amber-200"
          >
            Configure proxy
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            writeDismissed()
            setDismissed(true)
          }}
          className="rounded px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-400/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
