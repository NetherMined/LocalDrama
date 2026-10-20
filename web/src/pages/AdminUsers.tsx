import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AdminActivitySummary, type AdminUserRow } from '../api'
import { CreateUserDialog } from '../components/CreateUserDialog'
import { PlusIcon } from '../components/icons'
import { RoleBadge, StatusBadges, UserInitial } from '../components/UserBadges'
import { UserActions, type Notify } from '../components/UserActions'
import { Toast, useToast } from '../components/Toast'
import { LoadError, PageHeader, buttonClass } from '../components/ui'
import { errorMessage, fmtAgoOrNever, fmtWatchTime } from '../lib/format'
import { useStatus } from '../status'

interface UserRowData {
  user: AdminUserRow
  activity: AdminActivitySummary | null
}

const cellClass = 'px-4 py-3 align-middle'

export function AdminUsers() {
  const selfId = useStatus().status?.account?.id
  const [rows, setRows] = useState<UserRowData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [toast, notify] = useToast()
  const createRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    try {
      const [users, activity] = await Promise.all([api.adminUsers(), api.adminActivity()])
      const byId = new Map(activity.items.map((a) => [a.account.id, a]))
      setRows(users.items.map((user) => ({ user, activity: byId.get(user.id) ?? null })))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <PageHeader title="Users">
        <button ref={createRef} type="button" onClick={() => setShowCreate(true)} className={buttonClass()}>
          <PlusIcon className="h-4 w-4" />
          Create user
        </button>
      </PageHeader>
      <p className="-mt-4 mb-6 text-sm text-muted">Accounts, sign-in status and what each person has been watching.</p>

      {error && !rows && <LoadError title="Could not load users" message={error} onRetry={() => void load()} />}

      {!rows && !error && (
        <div aria-busy="true" aria-label="Loading users" className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">No accounts yet.</p>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] md:block">
            <table className="w-full min-w-[880px] text-left text-sm">
              <caption className="sr-only">Accounts with sign-in status and activity</caption>
              <thead className="border-b border-white/10 text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">User</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Profiles</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last active</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Watch 7d</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Watching</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Favourites</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row) => (
                  <UserTableRow
                    key={row.user.id}
                    row={row}
                    isSelf={row.user.id === selfId}
                    onChanged={() => void load()}
                    onNotify={notify}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <UserCard
                key={row.user.id}
                row={row}
                isSelf={row.user.id === selfId}
                onChanged={() => void load()}
                onNotify={notify}
              />
            ))}
          </ul>
        </>
      )}

      {showCreate && (
        <CreateUserDialog
          returnFocusRef={createRef}
          onClose={() => setShowCreate(false)}
          onCreated={() => void load()}
        />
      )}

      <Toast toast={toast} />
    </>
  )
}

function SelfMark() {
  return <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">You</span>
}

function UserTableRow({
  row,
  isSelf,
  onChanged,
  onNotify,
}: {
  row: UserRowData
  isSelf: boolean
  onChanged: () => void
  onNotify: Notify
}) {
  const { user, activity } = row
  return (
    <tr className="transition hover:bg-white/[0.03]">
      <td className={cellClass}>
        <div className="flex items-center gap-3">
          <UserInitial username={user.username} className="h-8 w-8 text-sm" />
          <Link
            to={`/admin/users/${user.id}`}
            className="font-semibold text-white underline-offset-4 hover:text-accent-hi hover:underline"
          >
            {user.username}
          </Link>
          {isSelf && <SelfMark />}
        </div>
      </td>
      <td className={cellClass}>
        <RoleBadge role={user.role} />
      </td>
      <td className={cellClass}>
        <StatusBadges user={user} />
      </td>
      <td className={`${cellClass} text-right tabular-nums`}>{user.profileCount}</td>
      <td className={`${cellClass} whitespace-nowrap text-muted`}>{fmtAgoOrNever(activity?.lastActiveAt ?? null)}</td>
      <td className={`${cellClass} text-right whitespace-nowrap tabular-nums`}>{fmtWatchTime(activity?.watchSeconds.d7 ?? 0)}</td>
      <td className={`${cellClass} text-right tabular-nums`}>{activity?.currentlyWatching ?? 0}</td>
      <td className={`${cellClass} text-right tabular-nums`}>{activity?.favourites ?? 0}</td>
      <td className={`${cellClass} text-right`}>
        <UserActions user={user} isSelf={isSelf} variant="menu" onChanged={onChanged} onNotify={onNotify} />
      </td>
    </tr>
  )
}

function UserCard({
  row,
  isSelf,
  onChanged,
  onNotify,
}: {
  row: UserRowData
  isSelf: boolean
  onChanged: () => void
  onNotify: Notify
}) {
  const { user, activity } = row
  const stats: { label: string; value: string }[] = [
    { label: 'Profiles', value: String(user.profileCount) },
    { label: 'Watch 7d', value: fmtWatchTime(activity?.watchSeconds.d7 ?? 0) },
    { label: 'Watching', value: String(activity?.currentlyWatching ?? 0) },
    { label: 'Favourites', value: String(activity?.favourites ?? 0) },
  ]
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserInitial username={user.username} className="h-10 w-10 text-base" />
          <div className="min-w-0">
            <p className="flex min-w-0 items-center">
              <Link to={`/admin/users/${user.id}`} className="truncate font-semibold text-white hover:text-accent-hi">
                {user.username}
              </Link>
              {isSelf && <SelfMark />}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <RoleBadge role={user.role} />
              <StatusBadges user={user} />
            </p>
          </div>
        </div>
        <UserActions user={user} isSelf={isSelf} variant="menu" onChanged={onChanged} onNotify={onNotify} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
        <div className="col-span-2">
          <dt className="text-xs text-muted">Last active</dt>
          <dd className="font-semibold">{fmtAgoOrNever(activity?.lastActiveAt ?? null)}</dd>
        </div>
      </dl>
    </li>
  )
}
