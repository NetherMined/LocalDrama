import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useStatus } from '../status'
import { Modal } from './Modal'
import { RequestAccessDialog } from './RequestAccessDialog'
import { buttonClass } from './ui'

export type AccountGuard = (action: () => void, context?: { showName?: string }) => void

const SignInContext = createContext<AccountGuard | null>(null)

export function SignInPromptProvider({ children }: { children: ReactNode }) {
  const { status } = useStatus()
  const location = useLocation()
  const signedIn = !!status?.authenticated
  const [prompt, setPrompt] = useState<{ showName?: string } | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const next = `${location.pathname}${location.search}`

  const guard = useCallback<AccountGuard>(
    (action, context) => {
      if (signedIn) action()
      else setPrompt({ showName: context?.showName })
    },
    [signedIn],
  )

  return (
    <SignInContext.Provider value={guard}>
      {children}
      {prompt && (
        <Modal
          title="Sign in to watch"
          description={prompt.showName ? `Sign in to watch ${prompt.showName}.` : 'Sign in to watch and save series.'}
          onClose={() => setPrompt(null)}
        >
          <div className="flex flex-col gap-3">
            <Link
              to={`/login?next=${encodeURIComponent(next)}`}
              data-autofocus
              onClick={() => setPrompt(null)}
              className={`${buttonClass('primary')} w-full py-3`}
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => {
                setPrompt(null)
                setRequestOpen(true)
              }}
              className={`${buttonClass('ghost')} w-full py-3`}
            >
              Request access
            </button>
          </div>
        </Modal>
      )}
      {requestOpen && <RequestAccessDialog onClose={() => setRequestOpen(false)} />}
    </SignInContext.Provider>
  )
}

export function useRequireAccount(): AccountGuard {
  const guard = useContext(SignInContext)
  if (!guard) throw new Error('useRequireAccount must be used inside SignInPromptProvider')
  return guard
}
