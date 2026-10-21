import { useEffect, useRef } from 'react'
import { SearchBox } from './SearchBox'
import { CloseIcon } from './icons'

export function SearchSheet({ onClose }: { onClose: () => void }) {
  const closing = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  function finish() {
    if (closing.current) return
    closing.current = true
    onCloseRef.current()
  }

  function dismiss() {
    if (closing.current) return
    // Back removes the history entry the sheet pushed; the popstate listener then closes it.
    if (window.history.state?.searchSheet === true) window.history.back()
    else finish()
  }

  useEffect(() => {
    if (window.history.state?.searchSheet !== true) {
      window.history.pushState({ ...(window.history.state ?? {}), searchSheet: true }, '')
    }
    function onPop() {
      finish()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) dismiss()
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div role="dialog" aria-modal="true" aria-label="Search dramas" className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <SearchBox inputId="site-search-sheet" sheet autoFocus onDone={finish} />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close search"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
