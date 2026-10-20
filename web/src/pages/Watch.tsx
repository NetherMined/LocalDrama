import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type LibraryEpisode, type LibraryShowDetail } from '../api'
import { PlayerShell, type PlayerEpisode, type PlayerSample, type ResolvedSource } from '../components/PlayerShell'
import { ErrorPanel, LoadError, buttonClass } from '../components/ui'
import { errorMessage, fmtEpisode, isGenericEpisodeName } from '../lib/format'

const RESUME_MIN_SECONDS = 5

export function Watch() {
  const { bookId = '', downloadId = '' } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<LibraryShowDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .libraryShow(bookId)
      .then(setDetail)
      .catch((err) => setError(errorMessage(err)))
  }, [bookId])

  // Only a change of book reloads the list; moving between episodes of the same book keeps the player mounted.
  useEffect(() => {
    setDetail(null)
    load()
  }, [load])

  const episodes = useMemo(
    () => [...(detail?.episodes ?? [])].sort((a, b) => a.episodeIndex - b.episodeIndex),
    [detail],
  )
  const playerEpisodes = useMemo<PlayerEpisode[]>(
    () =>
      episodes.map((ep) => ({
        key: String(ep.id),
        index: ep.episodeIndex,
        title: isGenericEpisodeName(ep.name) ? '' : ep.name,
      })),
    [episodes],
  )
  const current: LibraryEpisode | undefined = episodes.find((ep) => String(ep.id) === downloadId)

  const resolve = useCallback(
    async (key: string): Promise<ResolvedSource> => {
      const ep = episodes.find((e) => String(e.id) === key)
      if (!ep) throw new Error('This episode is not in your library.')
      const saved = ep.progress
      const startAt =
        saved && !saved.completed && saved.position > RESUME_MIN_SECONDS && saved.position < saved.duration
          ? saved.position
          : 0
      return { src: ep.mediaUrl, hls: false, startAt }
    },
    [episodes],
  )

  const saveProgress = useCallback((key: string, sample: PlayerSample, beacon: boolean) => {
    if (beacon) {
      api.saveProgressBeacon(key, sample.position, sample.duration)
      return
    }
    api.saveProgress(key, sample.position, sample.duration).catch(() => undefined)
  }, [])

  const onChange = useCallback(
    (key: string) => {
      navigate(`/watch/${encodeURIComponent(bookId)}/${encodeURIComponent(key)}`, { replace: true })
    },
    [bookId, navigate],
  )

  const onClose = useCallback(() => {
    navigate(`/library/${encodeURIComponent(bookId)}`)
  }, [bookId, navigate])

  if (error) return <LoadError title="Could not load this episode" message={error} onRetry={load} />
  if (!detail) return <p className="py-8 text-sm text-muted">Loading...</p>

  if (!current) {
    return (
      <div className="space-y-6">
        <ErrorPanel title="Episode not found" message="This episode is not in your library." />
        <Link to={`/library/${encodeURIComponent(bookId)}`} className={buttonClass('ghost')}>
          Back to show
        </Link>
      </div>
    )
  }

  const showName = detail.show?.name ?? bookId

  return (
    <div className="space-y-5">
      <PlayerShell
        key={bookId}
        episodes={playerEpisodes}
        currentKey={String(current.id)}
        resolve={resolve}
        onSave={saveProgress}
        onChange={onChange}
        onClose={onClose}
        showTitle={showName}
        poster={detail.show?.cover}
        alwaysVisible
      />

      <div className="min-w-0">
        <p className="text-sm text-muted">
          <Link to={`/library/${encodeURIComponent(bookId)}`} className="hover:text-white">
            {showName}
          </Link>
        </p>
        <h1 className="text-xl font-bold break-words sm:text-2xl">
          <span className="font-mono text-rose-400">{fmtEpisode(current.episodeIndex)}</span> {current.name}
        </h1>
      </div>
    </div>
  )
}
