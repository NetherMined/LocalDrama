import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  title,
  description,
  onClose,
  returnFocusRef,
  size = 'md',
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  /** `lg` is a taller sheet for long lists: full width on phones, 80vh tall. */
  size?: 'md' | 'lg'
  children: ReactNode
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const returnTo = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const panel = panelRef.current
    const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]')
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(preferred ?? first ?? panel)?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const head = items[0]
      const tail = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === head || !panelRef.current.contains(active))) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && (active === tail || !panelRef.current.contains(active))) {
        e.preventDefault()
        head.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (returnTo && returnTo.isConnected) returnTo.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full overflow-y-auto rounded-t-xl border border-line bg-panel p-5 shadow-2xl shadow-black/70 outline-none sm:rounded-xl sm:p-6 ${
          size === 'lg' ? 'max-h-[80vh] max-w-lg' : 'max-h-[90vh] max-w-md'
        }`}
      >
        <h2 id={titleId} className="text-lg font-bold tracking-tight">
          {title}
        </h2>
        {description && (
          <p id={descId} className="mt-1 text-sm text-muted">
            {description}
          </p>
        )}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}
