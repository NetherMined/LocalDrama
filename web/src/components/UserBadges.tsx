import type { AdminAccount } from '../api'

export function RoleBadge({ role }: { role: AdminAccount['role'] }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[11px] font-bold tracking-wider text-accent-hi uppercase">
        Admin
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-bold tracking-wider text-muted uppercase">
      User
    </span>
  )
}

export function StatusBadges({ user }: { user: Pick<AdminAccount, 'disabled' | 'mustChangePassword'> }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          user.disabled ? 'bg-white/10 text-muted' : 'bg-emerald-400/10 text-emerald-300'
        }`}
      >
        {user.disabled ? 'Disabled' : 'Active'}
      </span>
      {user.mustChangePassword && (
        <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
          Must change password
        </span>
      )}
    </span>
  )
}

export function UserInitial({ username, className = '' }: { username: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-panel-2 font-bold text-white ${className}`}
    >
      {username.charAt(0).toUpperCase() || '?'}
    </span>
  )
}
