import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, useEvents, type DownloadStatus, type Episode, type ShowDetail, type ShowSocial, type StreamProgress } from '../api'
import { useDownloads } from '../downloads'
import { useStatus } from '../status'
import { PlayerShell, type PlayerEpisode, type PlayerHandle, type PlayerSample, type ResolvedSource } from '../components/PlayerShell'
import { StatusPill } from '../components/StatusPill'
import { BellIcon, CheckIcon, ChevronRightIcon, HeartIcon, MoreVerticalIcon, PlayIcon, PlusIcon, ShareIcon } from '../components/icons'
import { PlatformLogo } from '../components/PlatformLogo'
import { Modal } from '../components/Modal'
import { Toast, useToast } from '../components/Toast'
import { LoadError } from '../components/ui'
import { errorMessage, isGenericEpisodeName } from '../lib/format'

type Display = 'none' | DownloadStatus | 'downloaded'

interface DisplayInfo {
  state: Display
  bytesDone?: number
  bytesTotal?: number
  id?: number | string
}

const RESUME_MIN_SECONDS = 5
const RANGE_SIZE = 50
const PINK = '#f0436a'

export function Show() {
  const { bookId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const source = searchParams.get('source') || undefined
  const { byEpisode } = useDownloads()
  const isAdmin = useStatus().status?.account?.role === 'admin'
  const [detail, setDetail] = useState<ShowDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraryIds, setLibraryIds] = useState<Map<number, number | string>>(() => new Map())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [isFav, setIsFav] = useState(false)
  const [favBusy, setFavBusy] = useState(false)
  const [social, setSocial] = useState<ShowSocial | null>(null)
  const [socialPending, setSocialPending] = useState<'like' | 'follow' | null>(null)
  const [progressByEp, setProgressByEp] = useState<Map<number, StreamProgress>>(() => new Map())
  const [progressReady, setProgressReady] = useState(false)
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rangeStart, setRangeStart] = useState<number | null>(null)
  const [allOpen, setAllOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [toast, notify] = useToast()
  const playerRef = useRef<PlayerHandle>(null)
  const allButtonRef = useRef<HTMLButtonElement>(null)
  const epParam = searchParams.get('ep')
  const autoOpened = useRef<string | null>(null)
  const currentBook = useRef(bookId)
  currentBook.current = bookId

  const loadLibrary = useCallback(() => {
    api
      .libraryShow(bookId)
      .then((res) => setLibraryIds(new Map(res.episodes.map((e) => [e.episodeIndex, e.id]))))
      .catch(() => setLibraryIds(new Map()))
  }, [bookId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setNotice(null)
    setProgressByEp(new Map())
    setProgressReady(false)
    setCurrentKey(null)
    setPlaying(false)
    setRangeStart(null)
    setAllOpen(false)
    setMoreOpen(false)
    setExpanded(false)
    setSocial(null)
    api
      .watchProgress(bookId)
      .then((res) => {
        if (!cancelled) setProgressByEp(new Map(res.items.map((p) => [p.episodeIndex, p])))
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProgressReady(true)
      })
    api
      .show(bookId, source)
      .then((res) => {
        if (cancelled) return
        setDetail(res)
        if (res.episodes.some((ep) => ep.downloaded)) loadLibrary()
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    api.isFavourite(bookId).then((r) => { if (!cancelled) setIsFav(r.favourite) }).catch(() => undefined)
    api.social(bookId).then((r) => { if (!cancelled) setSocial(r) }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [bookId, source, attempt, loadLibrary])

  useEvents((event) => {
    if (event.type === 'library' && event.bookId === bookId) loadLibrary()
  })

  function displayOf(ep: Episode): DisplayInfo {
    const live = byEpisode(bookId, ep.index)
    if (libraryIds.has(ep.index) || live?.status === 'completed') {
      return { state: 'downloaded', id: libraryIds.get(ep.index) }
    }
    if (live) {
      return { state: live.status, bytesDone: live.bytesDone, bytesTotal: live.bytesTotal }
    }
    if (ep.downloaded) return { state: 'downloaded', id: libraryIds.get(ep.index) }
    return { state: 'none' }
  }

  const episodes = detail?.episodes ?? []
  const selectable = episodes.filter((ep) => {
    const s = displayOf(ep).state
    return s === 'none' || s === 'failed'
  })

  async function downloadAll() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await api.enqueue(bookId)
      setNotice({
        kind: 'ok',
        text: res.added === 1 ? 'Added 1 episode to downloads.' : `Added ${res.added} episodes to downloads.`,
      })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleFavourite() {
    const prev = isFav
    setFavBusy(true)
    setIsFav(!prev)
    try {
      if (prev) await api.removeFavourite(bookId)
      else await api.addFavourite(bookId)
    } catch (err) {
      setIsFav(prev)
      notify(errorMessage(err), 'err')
    } finally {
      setFavBusy(false)
    }
  }

  async function toggleLike() {
    if (!social) return
    const prev = social
    const liked = !prev.liked
    setSocialPending('like')
    setSocial({ ...prev, liked, likes: Math.max(0, prev.likes + (liked ? 1 : -1)) })
    try {
      setSocial(await api.setLike(bookId, liked))
    } catch (err) {
      setSocial(prev)
      notify(errorMessage(err), 'err')
    } finally {
      setSocialPending(null)
    }
  }

  async function toggleFollow() {
    if (!social) return
    const prev = social
    const following = !prev.following
    setSocialPending('follow')
    setSocial({ ...prev, following })
    try {
      setSocial(await api.setFollow(bookId, following, show?.source ?? source))
    } catch (err) {
      setSocial(prev)
      notify(errorMessage(err), 'err')
    } finally {
      setSocialPending(null)
    }
  }

  async function share() {
    const url = window.location.href
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: `${title} · Episode ${selectedNumber}`, url })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    if (await copyText(url)) notify('Link copied', 'ok')
    else notify('Could not copy the link', 'err')
  }

  // Resumes an unfinished episode from where it was left; a few seconds in is not worth resuming.
  function resumeAt(index: number): number {
    const p = progressByEp.get(index)
    return p && !p.completed && p.position > RESUME_MIN_SECONDS ? p.position : 0
  }

  async function resolveStream(key: string): Promise<ResolvedSource> {
    const index = Number(key)
    const query = source ? `?source=${encodeURIComponent(source)}` : ''
    const res = await fetch(`/api/shows/${encodeURIComponent(bookId)}/stream/${index}${query}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Failed to get stream (${res.status})`)
    }
    const { url, hls } = await res.json()
    if (!url) throw new Error('No stream URL returned')
    return { src: url, hls: !!hls, startAt: resumeAt(index) }
  }

  // Must be called from a click handler (or the deep link effect for inline play) so the player can go fullscreen.
  function playEpisode(index: number, fullscreen = true) {
    const key = String(index)
    setCurrentKey(key)
    setPlaying(true)
    playerRef.current?.play(key, { fullscreen })
  }

  function onPlayerChange(key: string) {
    setCurrentKey(key)
    setPlaying(true)
    autoOpened.current = `${bookId}:${key}`
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('ep', key)
        return next
      },
      { replace: true },
    )
  }

  function onPlayerClose() {
    setPlaying(false)
    if (!searchParams.has('ep')) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('ep')
        return next
      },
      { replace: true },
    )
  }

  const saveWatch = useCallback(
    (index: number, sample: PlayerSample, beacon: boolean) => {
      if (beacon) {
        api.saveWatchBeacon(bookId, index, sample.position, sample.duration, source)
        return
      }
      const forBook = bookId
      api
        .saveWatch(bookId, index, sample.position, sample.duration, source)
        .then((res) => {
          if (currentBook.current !== forBook) return
          setProgressByEp((prev) => new Map(prev).set(index, { episodeIndex: index, ...res.progress }))
        })
        .catch(() => undefined)
    },
    [bookId, source],
  )

  // Deep link from Continue Watching: /show/<id>?ep=<index> plays that episode inline once its progress is known.
  useEffect(() => {
    if (epParam === null || loading || !progressReady || !detail) return
    const key = `${bookId}:${epParam}`
    if (autoOpened.current === key) return
    autoOpened.current = key
    const index = Number(epParam)
    if (!Number.isInteger(index) || !detail.episodes.some((ep) => ep.index === index)) return
    playEpisode(index, false)
    // playEpisode reads the progress map of the render that triggered this effect.
  }, [bookId, epParam, loading, progressReady, detail])

  if (loading) {
    return (
      <div className="animate-pulse" aria-busy="true" aria-label="Loading drama">
        <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
          <div className="mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-[calc(70vh*9/16)] rounded-lg bg-panel-2" />
          <div className="mt-6 space-y-3 lg:mt-0">
            <div className="h-4 w-1/2 rounded bg-panel-2" />
            <div className="h-8 w-2/3 rounded bg-panel-2" />
            <div className="h-20 w-full rounded bg-panel-2" />
            <div className="grid grid-cols-4 gap-2 pt-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="mx-auto h-12 w-12 rounded-full bg-panel-2" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadError title="Could not load this drama" message={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    )
  }

  const show = detail?.show ?? null
  const title = show?.name ?? bookId
  const playerEpisodes: PlayerEpisode[] = episodes.map((ep) => ({
    key: String(ep.index),
    index: ep.index,
    title: isGenericEpisodeName(ep.name) ? '' : ep.name,
  }))

  const progressList = [...progressByEp.values()].sort((a, b) => a.episodeIndex - b.episodeIndex)
  const resumeItem = progressList.filter((p) => !p.completed && p.position > RESUME_MIN_SECONDS).at(-1)
  const doneItem = progressList.filter((p) => p.completed).at(-1)
  const afterDone =
    doneItem && episodes.some((ep) => ep.index === doneItem.episodeIndex + 1) ? doneItem.episodeIndex + 1 : null
  const firstIndex = episodes[0]?.index ?? 0
  // The episode the page is about: the one playing or last played, else resume / next, else the first.
  const primaryIndex = resumeItem ? resumeItem.episodeIndex : (afterDone ?? firstIndex)
  const selectedIndex = currentKey !== null ? Number(currentKey) : primaryIndex
  const selectedNumber = selectedIndex + 1

  const tags = (show?.tags ?? []).slice(0, 4)
  const episodeTotal = episodes.length || show?.episodeCount || 0
  const platformId = show?.source ?? source ?? null

  const ranged = episodes.length > RANGE_SIZE
  const rangeCount = Math.ceil(episodes.length / RANGE_SIZE)
  const activeRange = ranged ? (rangeStart ?? Math.floor(Math.max(0, selectedIndex) / RANGE_SIZE) * RANGE_SIZE) : 0
  const visibleEpisodes = ranged ? episodes.slice(activeRange, activeRange + RANGE_SIZE) : episodes

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
        <div className="lg:sticky lg:top-24">
          {!playing && (
            <div className="relative mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-[calc(70vh*9/16)] overflow-hidden rounded-lg bg-black">
              {show?.cover && (
                <img
                  src={show.cover}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center p-6">
                {show?.cover ? (
                  <img
                    src={show.cover}
                    alt={title}
                    className="h-full max-h-full w-auto max-w-full rounded-md object-contain shadow-2xl shadow-black/70"
                  />
                ) : (
                  <p className="text-center text-lg font-bold">{title}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => playEpisode(selectedIndex)}
                disabled={episodes.length === 0}
                aria-label={`Play episode ${selectedNumber}`}
                className="absolute top-1/2 left-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-2xl shadow-black/70 transition hover:scale-105 disabled:opacity-40"
                style={{ backgroundColor: PINK }}
              >
                <PlayIcon className="ml-1 h-9 w-9" />
              </button>
            </div>
          )}
          <PlayerShell
            key={`${bookId}:${source ?? ''}`}
            ref={playerRef}
            episodes={playerEpisodes}
            resolve={resolveStream}
            onSave={(key, sample, beacon) => saveWatch(Number(key), sample, beacon)}
            onChange={onPlayerChange}
            onClose={onPlayerClose}
            showTitle={title}
            poster={show?.cover}
            portrait
            telemetry={{ platform: source, bookId }}
          />
        </div>

        <div className="mt-6 min-w-0 space-y-6 lg:mt-0">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <li>
                <Link to="/" className="hover:text-white">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="min-w-0">
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="max-w-[16rem] truncate text-left hover:text-white"
                >
                  {title}
                </button>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-white/40">
                EP {selectedNumber}
              </li>
            </ol>
          </nav>

          <div className="space-y-2">
            <h1 className="text-3xl leading-tight font-bold tracking-tight break-words sm:text-4xl">
              Episode {selectedNumber} · {title}
            </h1>
            {show?.introduction && (
              <div>
                <h2 className="text-sm font-bold">Episode {selectedNumber} plot</h2>
                <p className={`mt-1 text-sm leading-relaxed text-white/80 ${expanded ? '' : 'line-clamp-3'}`}>
                  {show.introduction}
                </p>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 min-h-11 text-sm font-semibold text-[#f0436a] hover:text-rose-300 sm:min-h-0"
                >
                  {expanded ? 'Less' : 'More'}
                </button>
              </div>
            )}
            {!show && <p className="text-sm text-amber-300">Details are not cached for this drama. Episodes are shown below.</p>}
            {(tags.length > 0 || show?.sourceName || episodeTotal > 0) && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                {[...tags, `${episodeTotal} episodes`].map((item, i) => (
                  <span key={`${item}-${i}`} className="inline-flex items-center gap-2">
                    {i > 0 && <span aria-hidden="true">·</span>}
                    {item}
                  </span>
                ))}
                {show?.sourceName && (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">·</span>
                    <PlatformLogo id={platformId} name={show.sourceName} size={16} decorative />
                    {show.sourceName}
                  </span>
                )}
              </p>
            )}
          </div>

          <div className={`grid gap-2 ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'} sm:max-w-md`}>
            <ActionButton
              label={social && social.likes > 0 ? `Like ${social.likes}` : 'Like'}
              pressed={social?.liked ?? false}
              disabled={!social || socialPending === 'like'}
              onClick={() => void toggleLike()}
            >
              <HeartIcon className="h-5 w-5" filled={social?.liked} />
            </ActionButton>
            <ActionButton label={isFav ? 'Saved' : 'Save'} pressed={isFav} disabled={favBusy} onClick={() => void toggleFavourite()}>
              {isFav ? <CheckIcon className="h-5 w-5" /> : <PlusIcon className="h-5 w-5" />}
            </ActionButton>
            <ActionButton
              label={social?.following ? 'Following' : 'Follow'}
              pressed={social?.following ?? false}
              disabled={!social || socialPending === 'follow'}
              onClick={() => void toggleFollow()}
            >
              <BellIcon className="h-5 w-5" filled={social?.following} />
            </ActionButton>
            <ActionButton label="Share" onClick={() => void share()}>
              <ShareIcon className="h-5 w-5" />
            </ActionButton>
            {isAdmin && (
              <div className="relative flex flex-col items-center">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                  className="flex min-h-11 flex-col items-center gap-2 text-xs font-medium text-white/90"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20">
                    <MoreVerticalIcon className="h-5 w-5" />
                  </span>
                  <span>More</span>
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute top-full right-0 z-20 mt-2 w-44 rounded-lg border border-line bg-panel-2 p-1 shadow-xl shadow-black/60"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy || selectable.length === 0}
                      onClick={() => {
                        setMoreOpen(false)
                        void downloadAll()
                      }}
                      className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-line disabled:opacity-40"
                    >
                      {busy ? 'Queuing...' : 'Download all'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {notice && (
            <p role="status" className={`text-sm ${notice.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
              {notice.text}
            </p>
          )}

          <section aria-labelledby="episodes-heading">
            <h2 id="episodes-heading" className="sr-only">
              Episodes
            </h2>
            <div className="mb-4 flex items-center justify-between gap-3">
              {ranged ? (
                <div className="flex min-w-0 gap-4 overflow-x-auto whitespace-nowrap">
                  {Array.from({ length: rangeCount }, (_, k) => {
                    const start = k * RANGE_SIZE
                    const end = Math.min(start + RANGE_SIZE, episodes.length)
                    const active = activeRange === start
                    return (
                      <button
                        key={start}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setRangeStart(start)}
                        className={`min-h-11 shrink-0 text-sm font-semibold transition ${
                          active ? 'text-[#f0436a]' : 'text-muted hover:text-white'
                        }`}
                      >
                        {start + 1}-{end}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span className="text-sm font-semibold text-[#f0436a]">
                  {episodes.length > 0 ? `1-${episodes.length}` : 'No episodes'}
                </span>
              )}
              {episodes.length > 0 && (
                <button
                  type="button"
                  ref={allButtonRef}
                  onClick={() => setAllOpen(true)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-white/80 hover:text-white"
                >
                  All episodes
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {episodes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                No episodes were returned for this drama.
              </p>
            ) : (
              <ul className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-10">
                {visibleEpisodes.map((ep) => (
                  <EpisodeTile
                    key={ep.index}
                    ep={ep}
                    progress={progressByEp.get(ep.index)}
                    selected={selectedIndex === ep.index}
                    onPlay={() => playEpisode(ep.index)}
                  />
                ))}
              </ul>
            )}
          </section>

          {allOpen && (
            <Modal
              title="All episodes"
              description={`${episodes.length} episodes`}
              size="lg"
              returnFocusRef={allButtonRef}
              onClose={() => setAllOpen(false)}
            >
              <ul className="-mx-2 divide-y divide-line">
                {episodes.map((ep) => (
                  <EpisodeRow
                    key={ep.index}
                    bookId={bookId}
                    ep={ep}
                    display={displayOf(ep)}
                    progress={progressByEp.get(ep.index)}
                    selected={selectedIndex === ep.index}
                    onPlay={() => {
                      playEpisode(ep.index)
                      setAllOpen(false)
                    }}
                  />
                ))}
              </ul>
            </Modal>
          )}
        </div>
      </div>
      <Toast toast={toast} />
    </>
  )
}

function ActionButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className="flex min-h-11 flex-col items-center gap-2 text-xs font-medium text-white/90 disabled:opacity-50"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          pressed ? 'bg-white/20 text-[#f0436a]' : 'bg-white/10 hover:bg-white/20'
        }`}
      >
        {children}
      </span>
      <span>{label}</span>
    </button>
  )
}

function progressPercent(progress: StreamProgress | undefined): number {
  return progress && progress.duration > 0 ? Math.min(100, Math.round((progress.position / progress.duration) * 100)) : 0
}

function EpisodeTile({
  ep,
  progress,
  selected,
  onPlay,
}: {
  ep: Episode
  progress: StreamProgress | undefined
  selected: boolean
  onPlay: () => void
}) {
  const number = ep.index + 1
  const watched = !!progress?.completed
  const percent = progressPercent(progress)
  const partial = !watched && percent > 0
  const state = watched ? ', watched' : partial ? ', in progress' : ''
  const tone = selected
    ? 'bg-[#f0436a] text-white'
    : watched
      ? 'bg-[#1c1c1c] text-white/40 hover:bg-[#262626]'
      : 'bg-[#2a2a2a] text-white hover:bg-[#363636]'

  return (
    <li>
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Episode ${number}${state}`}
        aria-current={selected || undefined}
        className={`relative flex aspect-square w-full items-center justify-center rounded-lg text-sm font-semibold transition ${tone}`}
      >
        {number}
        {watched && !selected && <CheckIcon className="absolute top-1 right-1 h-3 w-3 text-white/50" />}
        {partial && (
          <span aria-hidden="true" className="absolute inset-x-2 bottom-1.5 block h-0.5 overflow-hidden rounded bg-white/15">
            <span className="block h-full" style={{ width: `${percent}%`, backgroundColor: PINK }} />
          </span>
        )}
      </button>
    </li>
  )
}

function EpisodeRow({
  bookId,
  ep,
  display,
  progress,
  selected,
  onPlay,
}: {
  bookId: string
  ep: Episode
  display: DisplayInfo
  progress: StreamProgress | undefined
  selected: boolean
  onPlay: () => void
}) {
  const number = ep.index + 1
  const name = isGenericEpisodeName(ep.name) ? `Episode ${number}` : ep.name
  const percent = progressPercent(progress)
  const partial = !!progress && !progress.completed && percent > 0
  const localHref =
    display.state === 'downloaded' && display.id !== undefined
      ? `/watch/${encodeURIComponent(bookId)}/${encodeURIComponent(String(display.id))}`
      : null

  return (
    <li className="flex items-center gap-3 px-2">
      <button
        type="button"
        onClick={onPlay}
        aria-current={selected || undefined}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
      >
        <span className={`w-10 shrink-0 font-mono text-sm ${selected ? 'text-[#f0436a]' : 'text-muted'}`}>{number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          {partial && (
            <span
              role="progressbar"
              aria-label={`Episode ${number} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-1.5 block h-1 w-full overflow-hidden rounded bg-white/10"
            >
              <span className="block h-full" style={{ width: `${percent}%`, backgroundColor: PINK }} />
            </span>
          )}
        </span>
        {progress?.completed && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-300">
            <CheckIcon className="h-3.5 w-3.5" />
            Watched
          </span>
        )}
        {display.state !== 'none' && display.state !== 'downloaded' && (
          <StatusPill status={display.state} bytesDone={display.bytesDone} bytesTotal={display.bytesTotal} />
        )}
      </button>
      {display.state === 'downloaded' &&
        (localHref ? (
          <Link
            to={localHref}
            className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-emerald-300 hover:bg-emerald-500/25"
          >
            Downloaded
          </Link>
        ) : (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-emerald-300">
            Downloaded
          </span>
        ))}
    </li>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // The Clipboard API is unavailable on plain-http LAN addresses; fall back below.
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

function BackLink() {
  return (
    <Link to="/browse" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-white">
      &larr; Back to browse
    </Link>
  )
}
