import { useId, useState, type FormEvent, type RefObject } from 'react'
import { api, type AccountRole } from '../api'
import { errorMessage } from '../lib/format'
import { Modal } from './Modal'
import { TempPasswordView } from './TempPasswordView'
import { NoticeText, buttonClass, inputClass } from './ui'

const USERNAME_CHARS = /^[a-zA-Z0-9._-]*$/

export function usernameProblem(value: string): string | null {
  if (value.length === 0) return null
  if (!USERNAME_CHARS.test(value)) return 'Use only letters, numbers, dot, dash or underscore.'
  if (value.length < 3) {
    const more = 3 - value.length
    return `Add ${more} more character${more === 1 ? '' : 's'}.`
  }
  if (value.length > 32) {
    const extra = value.length - 32
    return `Remove ${extra} character${extra === 1 ? '' : 's'} (32 at most).`
  }
  return null
}

export function CreateUserDialog({
  onClose,
  onCreated,
  returnFocusRef,
}: {
  onClose: () => void
  onCreated: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const hintId = useId()
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<AccountRole>('user')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)

  const problem = usernameProblem(username)
  const valid = problem === null && username.length >= 3

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.createAdminUser(username.trim(), role)
      setCreated({ username: res.account.username, password: res.tempPassword })
      onCreated()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <Modal title="Share these sign-in details" onClose={onClose} returnFocusRef={returnFocusRef}>
        <TempPasswordView username={created.username} password={created.password} onDone={onClose} />
      </Modal>
    )
  }

  return (
    <Modal
      title="Create user"
      description="A temporary password is generated for the new account."
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <div>
          <label htmlFor="new-username" className="text-sm font-semibold">
            Username
          </label>
          <input
            id="new-username"
            data-autofocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            aria-invalid={problem !== null}
            aria-describedby={hintId}
            className={inputClass}
          />
          <p id={hintId} className={`mt-1.5 text-xs ${problem ? 'text-red-300' : 'text-muted'}`}>
            {problem ?? '3-32 characters: letters, numbers, dot, dash or underscore.'}
          </p>
        </div>
        <div>
          <label htmlFor="new-role" className="text-sm font-semibold">
            Role
          </label>
          <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as AccountRole)} className={inputClass}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <NoticeText notice={{ kind: 'err', text: error }} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonClass('ghost')}>
            Cancel
          </button>
          <button type="submit" disabled={!valid || busy} className={buttonClass()}>
            {busy ? 'Creating...' : 'Create user'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
