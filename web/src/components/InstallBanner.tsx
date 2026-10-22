import { useState } from 'react'
import { useInstall } from '../install'
import { InstallDialog } from './InstallDialog'
import { CloseIcon } from './icons'

const STORAGE_KEY = 'dramaus.installBanner'

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dismissed'
  } catch {
    return false
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'dismissed')
  } catch {
    // Storage is blocked; the banner simply shows again next visit.
  }
}

export function InstallBanner() {
  const { installed, platform } = useInstall()
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [dialogOpen, setDialogOpen] = useState(false)

  if (installed || dismissed || platform === 'tv') {
    return dialogOpen ? <InstallDialog onClose={() => setDialogOpen(false)} /> : null
  }

  function dismiss() {
    rememberDismissed()
    setDismissed(true)
  }

  return (
    <>
      <div
        role="region"
        aria-label="Install Dramora"
        className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-xl border border-white/10 bg-panel-2 p-3 shadow-2xl shadow-black/70 sm:hidden"
      >
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Install Dramora</p>
          <p className="truncate text-xs text-muted">
            {platform === 'android' ? 'Download the Android app' : 'Open it full-screen from your home screen'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-accent px-3 text-sm font-semibold text-white"
        >
          {platform === 'android' ? 'Install' : 'How'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:text-white"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      {dialogOpen && <InstallDialog onClose={() => setDialogOpen(false)} />}
    </>
  )
}
