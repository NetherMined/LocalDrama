import { useEffect, useRef } from 'react'

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'

export interface UpstreamStatus {
  ok: boolean
  error?: string
  at?: number | string
}

export interface AppStatus {
  configured: boolean
  mock: boolean
  version: string
  lanUrls: string[]
  upstream?: UpstreamStatus
  authRequired: boolean
  authenticated: boolean
  profile: Profile | null
  profileRequired: boolean
}

export interface Profile {
  id: number
  name: string
  color: string
  hasPin: boolean
  isAdmin: boolean
}

export interface ProfileInput {
  name?: string
  color?: string
  pin?: string
  isAdmin?: boolean
}

export interface ProgressInfo {
  position: number
  duration: number
  completed: boolean
}

export interface ContinueItem {
  show: Show
  episode: LibraryEpisode
  position: number
  duration: number
}

export interface IntegrationResult {
  ok: boolean
  at: number | string
  error?: string
}

export interface JellyfinIntegration {
  enabled: boolean
  url: string
  apiKey: string
  lastResult: IntegrationResult | null
}

export interface PlexIntegration {
  enabled: boolean
  url: string
  token: string
  sectionId: string
  lastResult: IntegrationResult | null
}

export interface Integrations {
  jellyfin: JellyfinIntegration
  plex: PlexIntegration
}

export interface IntegrationTest {
  ok: boolean
  error?: string
  name?: string
  version?: string
  sections?: { id: number | string; title: string }[]
}

export interface Health {
  ok: boolean
  version: string
  uptime: number
  configured: boolean
  db: 'ok' | 'error'
  queue: { queued: number; downloading: number; paused: number; failed: number }
  upstream: { ok: boolean }
  disk: { freeBytes: number; totalBytes: number } | null
}

export interface Language {
  code: string
  label: string
}

export interface SetupDefaults {
  suggestedRoot: string
  languages: Language[]
}

export interface PathValidation {
  ok: boolean
  error?: string
  resolved: string
}

export interface ProxyTest {
  ok: boolean
  ip?: string
  country?: string
  apiOk: boolean
  error?: string
}

export interface Config {
  downloadRoot: string
  language: string
  proxyUrl: string
  requestDelay: number
  concurrency: number
  quality: number
  configured: boolean
  hasPassword: boolean
  mdns: boolean
  integrations: Integrations
}

export interface IntegrationsPatch {
  jellyfin?: Partial<Omit<JellyfinIntegration, 'lastResult'>>
  plex?: Partial<Omit<PlexIntegration, 'lastResult'>>
}

export type SettingsPatch = Partial<Omit<Config, 'configured' | 'hasPassword' | 'integrations'>> & {
  password?: string
  integrations?: IntegrationsPatch
}

export interface SetupInput {
  downloadRoot: string
  language: string
  proxyUrl?: string
  requestDelay?: number
  concurrency?: number
  quality?: number
  password?: string
}

export interface Show {
  bookId: string
  name: string
  cover: string
  introduction: string
  episodeCount: number
  playCount: number
  tags: string[]
  status?: string
}

export interface HomeRow {
  key: string
  title: string
  items: Show[]
  source?: string
  note?: string
}

export interface HomeData {
  hero: Show | null
  rows: HomeRow[]
  errors: { key: string; error: string }[]
  sources?: { id: string; name: string; type: string; enabled: boolean }[]
  activeSourceId?: string
}

export interface Episode {
  index: number
  chapterId: string
  name: string
  downloaded: boolean
  downloadStatus?: DownloadStatus
}

export interface Page<T> {
  items: T[]
  hasMore: boolean
}

export interface Suggestion {
  bookId: string
  name: string
  cover: string
}

export interface ShowDetail {
  show: Show | null
  episodes: Episode[]
}

export interface DownloadItem {
  id: number | string
  bookId: string
  showName: string
  episodeIndex: number
  episodeName: string
  status: DownloadStatus
  bytesDone: number
  bytesTotal: number
  error?: string
  filePath?: string
  attempts: number
  nextAttemptAt?: number | null
  createdAt: string
  updatedAt: string
}

export interface LibraryShow extends Show {
  downloaded: number
}

export interface LibraryEpisode {
  id: number | string
  episodeIndex: number
  name: string
  filePath: string
  size: number
  mediaUrl: string
  progress: ProgressInfo | null
}

export interface LibraryShowDetail {
  show: Show | null
  episodes: LibraryEpisode[]
}

export interface LibraryScanResult {
  added: number
  removed: number
}

export type AppEvent =
  | { type: 'open' }
  | { type: 'download'; item: DownloadItem }
  | { type: 'library'; bookId: string }

function handleUnauthorized() {
  if (window.location.pathname === '/login') return
  const next = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?next=${encodeURIComponent(next)}`)
}

function handleProfileRequired() {
  if (window.location.pathname.startsWith('/profiles')) return
  const next = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/profiles?next=${encodeURIComponent(next)}`)
}

const ADMIN_REQUIRED_MESSAGE = 'Only an admin profile can do that.'

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: string | undefined
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  const res = await fetch(path, { method: init?.method ?? 'GET', headers, body })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null
    if (res.status === 401 && code !== 'invalid_pin') handleUnauthorized()
    if (res.status === 403 && code === 'profile_required') {
      handleProfileRequired()
      throw new Error('Choose a profile to continue.')
    }
    if (res.status === 403 && code === 'admin_required') throw new Error(ADMIN_REQUIRED_MESSAGE)
    throw new Error(code ?? `Request failed (${res.status})`)
  }
  return data as T
}

function progressPath(downloadId: number | string) {
  return `/api/progress/${enc(String(downloadId))}`
}

const enc = encodeURIComponent

export const api = {
  status: () => request<AppStatus>('/api/status'),
  setupDefaults: () => request<SetupDefaults>('/api/setup/defaults'),
  validatePath: (path: string) =>
    request<PathValidation>('/api/setup/validate-path', { method: 'POST', body: { path } }),
  testProxy: (proxyUrl: string) =>
    request<ProxyTest>('/api/setup/test-proxy', { method: 'POST', body: { proxyUrl } }),
  completeSetup: (input: SetupInput) =>
    request<{ ok: true }>('/api/setup', { method: 'POST', body: input }),
  settings: () => request<Config>('/api/settings'),
  updateSettings: (patch: SettingsPatch) =>
    request<Config>('/api/settings', { method: 'PUT', body: patch }),

  login: (password: string) => request<{ ok: true }>('/api/auth/login', { method: 'POST', body: { password } }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  home: (refresh = false) => request<HomeData>(refresh ? '/api/home?refresh=1' : '/api/home'),
  latest: (page = 1) => request<Page<Show>>(`/api/browse/latest?page=${page}`),
  search: (q: string, page = 1) => request<Page<Show>>(`/api/search?q=${enc(q)}&page=${page}`),
  suggest: (q: string) => request<{ items: Suggestion[] }>(`/api/search/suggest?q=${enc(q)}`),
  show: (bookId: string) => request<ShowDetail>(`/api/shows/${enc(bookId)}`),

  favourites: () => request<{ items: Show[] }>('/api/favourites'),
  addFavourite: (bookId: string) => request<{ ok: true }>(`/api/favourites/${enc(bookId)}`, { method: 'POST' }),
  removeFavourite: (bookId: string) => request<{ ok: true }>(`/api/favourites/${enc(bookId)}`, { method: 'DELETE' }),
  isFavourite: (bookId: string) => request<{ favourite: boolean }>(`/api/favourites/${enc(bookId)}`),

  downloads: () => request<{ items: DownloadItem[] }>('/api/downloads'),
  enqueue: (bookId: string, episodes?: number[]) =>
    request<{ added: number }>('/api/downloads', {
      method: 'POST',
      body: episodes ? { bookId, episodes } : { bookId },
    }),
  removeDownload: (id: number | string) =>
    request<{ ok: true }>(`/api/downloads/${enc(String(id))}`, { method: 'DELETE' }),
  retryDownload: (id: number | string) =>
    request<{ ok: true }>(`/api/downloads/${enc(String(id))}/retry`, { method: 'POST' }),
  pauseDownload: (id: number | string) =>
    request<{ ok: true }>(`/api/downloads/${enc(String(id))}/pause`, { method: 'POST' }),
  resumeDownload: (id: number | string) =>
    request<{ ok: true }>(`/api/downloads/${enc(String(id))}/resume`, { method: 'POST' }),
  pauseAll: () => request<{ ok: true }>('/api/downloads/pause-all', { method: 'POST' }),
  resumeAll: () => request<{ ok: true }>('/api/downloads/resume-all', { method: 'POST' }),
  clearCompleted: () => request<{ ok: true }>('/api/downloads/clear-completed', { method: 'POST' }),

  library: () => request<{ shows: LibraryShow[] }>('/api/library'),
  libraryShow: (bookId: string) => request<LibraryShowDetail>(`/api/library/${enc(bookId)}`),
  scanLibrary: () => request<LibraryScanResult>('/api/library/scan', { method: 'POST' }),
  deleteLibraryEpisode: (id: number | string) =>
    request<{ ok: true }>(`/api/library/episodes/${enc(String(id))}`, { method: 'DELETE' }),

  profiles: () => request<{ items: Profile[] }>('/api/profiles'),
  selectProfile: (id: number, pin?: string) =>
    request<{ profile: Profile }>(`/api/profiles/${enc(String(id))}/select`, {
      method: 'POST',
      body: pin ? { pin } : {},
    }),
  signoutProfile: () => request<{ ok: true }>('/api/profiles/signout', { method: 'POST' }),
  createProfile: (input: ProfileInput & { name: string }) =>
    request<Profile>('/api/profiles', { method: 'POST', body: input }),
  updateProfile: (id: number, patch: ProfileInput) =>
    request<Profile>(`/api/profiles/${enc(String(id))}`, { method: 'PUT', body: patch }),
  deleteProfile: (id: number) =>
    request<{ ok: true }>(`/api/profiles/${enc(String(id))}`, { method: 'DELETE' }),

  saveProgress: (downloadId: number | string, position: number, duration: number) =>
    request<ProgressInfo>(progressPath(downloadId), { method: 'PUT', body: { position, duration } }),
  saveProgressBeacon: (downloadId: number | string, position: number, duration: number): boolean => {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false
    const blob = new Blob([JSON.stringify({ position, duration })], { type: 'application/json' })
    return navigator.sendBeacon(`${progressPath(downloadId)}?method=PUT`, blob)
  },
  continueWatching: () => request<{ items: ContinueItem[] }>('/api/progress/continue'),

  testIntegration: (type: 'jellyfin' | 'plex', input: { url?: string; apiKey?: string; token?: string }) =>
    request<IntegrationTest>('/api/integrations/test', { method: 'POST', body: { type, ...input } }),
  refreshIntegration: (type: 'jellyfin' | 'plex') =>
    request<{ ok: boolean; error?: string }>('/api/integrations/refresh', { method: 'POST', body: { type } }),

  health: () => request<Health>('/api/health'),
}

type Listener = (event: AppEvent) => void

const listeners = new Set<Listener>()
let source: EventSource | null = null

function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function emit(event: AppEvent) {
  listeners.forEach((listener) => listener(event))
}

function openSource() {
  if (source) return
  const es = new EventSource('/api/events')
  es.addEventListener('open', () => emit({ type: 'open' }))
  es.addEventListener('download', (e) => {
    const item = parse<DownloadItem>((e as MessageEvent<string>).data)
    if (item) emit({ type: 'download', item })
  })
  es.addEventListener('library', (e) => {
    const data = parse<{ bookId: string }>((e as MessageEvent<string>).data)
    if (data) emit({ type: 'library', bookId: data.bookId })
  })
  source = es
}

function closeSourceIfIdle() {
  if (listeners.size === 0 && source) {
    source.close()
    source = null
  }
}

export function useEvents(onEvent: Listener) {
  const handler = useRef(onEvent)
  useEffect(() => {
    handler.current = onEvent
  })
  useEffect(() => {
    const listener: Listener = (event) => handler.current(event)
    listeners.add(listener)
    openSource()
    return () => {
      listeners.delete(listener)
      closeSourceIfIdle()
    }
  }, [])
}
