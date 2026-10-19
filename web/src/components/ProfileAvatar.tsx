export const PROFILE_COLORS = [
  '#e11d48',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

export function profileInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export function ProfileAvatar({ name, color, className = '' }: { name: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {profileInitial(name)}
    </span>
  )
}
