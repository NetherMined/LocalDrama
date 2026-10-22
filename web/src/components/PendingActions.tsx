import { useState } from 'react'
import { api, type AdminAccount } from '../api'
import { errorMessage } from '../lib/format'
import { useStatus } from '../status'
import { Modal } from './Modal'
import type { Notify } from './UserActions'
import { buttonClass } from './ui'

export function PendingActions({
  user,
  onDone,
  onNotify,
}: {
  user: Pick<AdminAccount, 'id' | 'username'>
  onDone: (outcome: 'approved' | 'rejected') => void
  onNotify: Notify
}) {
  const { reload } = useStatus()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  async function approve() {
    setBusy(true)
    try {
      await api.approveUser(user.id)
      onNotify(`${user.username} is approved and can sign in`, 'ok')
      void reload()
      onDone('approved')
    } catch (err) {
      onNotify(errorMessage(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    try {
      await api.deleteAdminUser(user.id)
      setRejecting(false)
      onNotify(`${user.username}'s request was rejected`, 'ok')
      void reload()
      onDone('rejected')
    } catch (err) {
      onNotify(errorMessage(err), 'err')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void approve()} disabled={busy} className={buttonClass()}>
          Approve
        </button>
        <button type="button" onClick={() => setRejecting(true)} disabled={busy} className={buttonClass('danger')}>
          Reject
        </button>
      </div>
      {rejecting && (
        <Modal
          title={`Reject ${user.username}?`}
          description="The pending account is deleted. They can request access again later."
          onClose={() => setRejecting(false)}
        >
          <div className="flex justify-end gap-2">
            <button type="button" data-autofocus onClick={() => setRejecting(false)} className={buttonClass('ghost')}>
              Cancel
            </button>
            <button type="button" onClick={() => void reject()} disabled={busy} className={buttonClass('danger')}>
              {busy ? 'Rejecting...' : 'Reject request'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
