import { useState } from 'react'
import { platformInfo } from '../lib/platforms'

const SIZES = {
  16: { box: 'h-4 w-4', text: 'text-[8px]', radius: 'rounded-[4px]' },
  20: { box: 'h-5 w-5', text: 'text-[10px]', radius: 'rounded-[5px]' },
  24: { box: 'h-6 w-6', text: 'text-[11px]', radius: 'rounded-md' },
  32: { box: 'h-8 w-8', text: 'text-sm', radius: 'rounded-lg' },
} as const

export function PlatformLogo({
  id,
  name,
  size = 20,
  decorative = false,
  className = '',
}: {
  id: string | null | undefined
  name?: string | null
  size?: 16 | 20 | 24 | 32
  /** Set when the platform name is already printed next to the logo, so the image is hidden from assistive tech. */
  decorative?: boolean
  className?: string
}) {
  const info = platformInfo(id, name)
  const [failed, setFailed] = useState(false)
  const dims = SIZES[size]
  const label = name ?? info.name
  const letters = info.name.replace(/[^\p{L}\p{N}+]/gu, '').slice(0, 2).toUpperCase() || '?'

  if (info.hasLogo && !failed && id) {
    return (
      <img
        src={`/platforms/${id}.png`}
        alt={decorative ? '' : label}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${dims.box} ${dims.radius} shrink-0 bg-white/5 object-contain ${className}`}
      />
    )
  }

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      style={{ backgroundColor: info.color }}
      className={`${dims.box} ${dims.radius} ${dims.text} inline-flex shrink-0 items-center justify-center leading-none font-black tracking-tight text-white ${className}`}
    >
      {letters}
    </span>
  )
}
