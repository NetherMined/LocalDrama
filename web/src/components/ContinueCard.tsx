import type { Show, StreamContinueItem } from '../api'
import { fmtEpisode, fmtMinutesLeft } from '../lib/format'
import { ShowCard } from './ShowCard'

export interface ContinueEntry {
  show: Show
  to: string
  episodeIndex: number
  position: number
  duration: number
}

export function continueEntries(items: StreamContinueItem[]): ContinueEntry[] {
  const seen = new Set<string>()
  const out: ContinueEntry[] = []
  for (const item of [...items].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (seen.has(item.show.bookId)) continue
    seen.add(item.show.bookId)
    out.push(streamEntry(item))
  }
  return out
}

function streamEntry(item: StreamContinueItem): ContinueEntry {
  const params = new URLSearchParams()
  if (item.source) params.set('source', item.source)
  params.set('ep', String(item.episodeIndex))
  return {
    show: item.show,
    to: `/show/${encodeURIComponent(item.show.bookId)}?${params.toString()}`,
    episodeIndex: item.episodeIndex,
    position: item.position,
    duration: item.duration,
  }
}

export function ContinueCard({ entry }: { entry: ContinueEntry }) {
  const { show, to, episodeIndex, position, duration } = entry
  const progress = duration > 0 ? position / duration : 0
  const caption =
    position > 0
      ? `${fmtEpisode(episodeIndex)} · ${fmtMinutesLeft(position, duration)}`
      : `Up next: ${fmtEpisode(episodeIndex)}`
  return <ShowCard show={show} to={to} progress={progress} caption={caption} />
}
