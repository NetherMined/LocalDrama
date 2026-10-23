const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

interface IconProps {
  className?: string
}

export function CheckIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function GearIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

export function ChevronLeftIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function ChevronRightIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function RefreshIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}

export function LockIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function BackspaceIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M21 5H9l-6 7 6 7h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      <path d="M18 9l-6 6M12 9l6 6" />
    </svg>
  )
}

export function PlusIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function PencilIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

export function TrashIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  )
}

export function SearchIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

export function BellIcon({ className = 'h-5 w-5', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg {...common} fill={filled ? 'currentColor' : 'none'} className={className}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

export function HeartIcon({ className = 'h-5 w-5', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg {...common} fill={filled ? 'currentColor' : 'none'} className={className}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.3l7.8-7.9 1-1.1a5.5 5.5 0 0 0 0-7.7z" />
    </svg>
  )
}

export function PlayIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  )
}

export function ArrowRightIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function UserIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

export function CloseIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function FullscreenIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  )
}

export function ExitFullscreenIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  )
}

export function SkipBackIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M18 5 9 12l9 7V5z" />
      <path d="M6 5v14" />
    </svg>
  )
}

export function SkipForwardIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M6 5l9 7-9 7V5z" />
      <path d="M18 5v14" />
    </svg>
  )
}

export function ShareIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

export function AddSquareIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

export function MoreVerticalIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  )
}

export function HomeIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

export function GridIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export function BookmarkIcon({ className = 'h-5 w-5', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg {...common} fill={filled ? 'currentColor' : 'none'} className={className}>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  )
}

export function HistoryIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
