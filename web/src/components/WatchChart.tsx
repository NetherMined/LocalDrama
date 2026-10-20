import type { ActivityDay } from '../api'
import { fmtDayShort, fmtWatchTime } from '../lib/format'

const WIDTH = 640
const HEIGHT = 168
const LEFT = 44
const RIGHT = WIDTH - 8
const TOP = 12
const BOTTOM = 136

export function WatchChart({ daily }: { daily: ActivityDay[] }) {
  const total = daily.reduce((sum, d) => sum + d.seconds, 0)
  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
        No watch time in the last 30 days.
      </div>
    )
  }

  const max = Math.max(...daily.map((d) => d.seconds))
  const busiest = daily.find((d) => d.seconds === max)
  const slot = (RIGHT - LEFT) / daily.length
  const barWidth = slot * 0.66
  const plotHeight = BOTTOM - TOP
  const summary = `Watch time over the last 30 days: ${fmtWatchTime(total)} in total. Busiest day ${
    busiest ? fmtDayShort(busiest.day) : ''
  } with ${fmtWatchTime(max)}.`

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full max-w-2xl overflow-visible"
      >
        <text x={LEFT - 8} y={TOP + 4} textAnchor="end" className="fill-muted text-[10px]">
          {fmtWatchTime(max)}
        </text>
        <text x={LEFT - 8} y={BOTTOM + 4} textAnchor="end" className="fill-muted text-[10px]">
          0m
        </text>
        <line x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} className="stroke-line" strokeWidth={1} />
        <line x1={LEFT} x2={RIGHT} y1={TOP} y2={TOP} className="stroke-line" strokeWidth={1} strokeDasharray="2 3" />
        {daily.map((d, i) => {
          const height = max > 0 ? (d.seconds / max) * plotHeight : 0
          const x = LEFT + i * slot + (slot - barWidth) / 2
          return (
            <rect
              key={d.day}
              x={x}
              y={BOTTOM - height}
              width={barWidth}
              height={Math.max(0, height)}
              rx={1.5}
              className="fill-accent"
            >
              <title>{`${fmtDayShort(d.day)}: ${fmtWatchTime(d.seconds)}`}</title>
            </rect>
          )
        })}
        {daily.map((d, i) => {
          if (i % 7 !== 0) return null
          const x = LEFT + i * slot + slot / 2
          return (
            <text key={`x-${d.day}`} x={x} y={BOTTOM + 18} textAnchor="middle" className="fill-muted text-[10px]">
              {fmtDayShort(d.day)}
            </text>
          )
        })}
      </svg>
      <p className="mt-3 text-xs text-muted">{summary}</p>
    </div>
  )
}
