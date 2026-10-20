import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStatus } from '../status'
import { LockIcon } from './icons'
import { buttonClass } from './ui'

export function AdminOnly({
  title = 'Downloads are managed by your admin',
  children,
}: {
  title?: string
  children: ReactNode
}) {
  const { status } = useStatus()
  if (status?.account?.role === 'admin') return <>{children}</>
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-panel-2 text-muted">
        <LockIcon className="h-6 w-6" />
      </span>
      <p className="mt-5 text-xs font-bold tracking-widest text-muted uppercase">Ask an admin</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        This part of DramaUs is only for admin accounts. Ask an admin if you need something changed.
      </p>
      <Link to="/" className={`${buttonClass()} mt-6`}>
        Back to home
      </Link>
    </div>
  )
}
