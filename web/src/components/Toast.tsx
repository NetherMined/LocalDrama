import { useCallback, useEffect, useState } from 'react'

export interface ToastMessage {
  kind: 'ok' | 'err'
  text: string
}

export function useToast(): [ToastMessage | null, (text: string, kind: 'ok' | 'err') => void] {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(id)
  }, [toast])

  const notify = useCallback((text: string, kind: 'ok' | 'err') => setToast({ text, kind }), [])
  return [toast, notify]
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null
  return (
    <div
      role={toast.kind === 'err' ? 'alert' : 'status'}
      className={`fixed right-4 bottom-4 left-4 z-[60] rounded-lg border px-4 py-3 text-sm shadow-xl shadow-black/60 sm:left-auto sm:max-w-sm ${
        toast.kind === 'err' ? 'border-red-400/40 bg-red-950 text-red-200' : 'border-emerald-400/40 bg-emerald-950 text-emerald-200'
      }`}
    >
      {toast.text}
    </div>
  )
}
