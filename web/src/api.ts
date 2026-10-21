import { useEffect, useRef } from 'react'
import { parseUserAgent } from './lib/userAgent'

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'

export interface UpstreamStatus {
  ok: boolean
  error?: string
  at?: number | string
}

export type AccountRole = 'admin' | 'user'
export type AccountTier = 'free' | 'vip'

export interface AccountSummary {
  id: number
  username: string
  role: AccountRole
  tier: AccountTier
  vipUntil: string | null
  mustChangePassword: boolean
}

export interface Account extends AccountSummary {
  disabled: boolean
  hasPassword: boolean
  createdAt: string
}

export interface Device {
  id: string
  name: string
  userAgent: string
  ip: string
  firstSeenAt: string
  lastSeenAt: string
  current: boolean
}

export interface AppNotification {
  id: number
  kind: string
  title: string
  body: string
  createdAt: string
  readAt: string | null
  link?: string | null
}

export interface ShowSocial {
  likes: number
  liked: boolean
  following: boolean
}

export interface StreamProgress {
  episodeIndex: number
  position: number
  duration: number
  completed: boolean
}

export interface StreamContinueItem {
  kind: 'stream'
  show: Show
  episodeIndex: number
  position: number
  duration: number
  source: string | null
  updatedAt: number
}

export interface AppStatus {
  configured: boolean
  mock: boolean
  version: string
  lanUrls: string[]
  publicUrl?: string
  upstream?: UpstreamStatus
  authRequired: boolean
  authenticated: boolean
  account: AccountSummary | null
  needsBootstrap: boolean
  defaultCredentials: boolean
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

export interface PlanPrices {
  series: number
  seriesMyList: number
  platform: number
  episodes: number
}

export interface DailyWeight {
  kind: 'points' | 'episodes' | 'series'
  value: number
  weight: number
}

export interface Plan {
  version: number
  vipPlatforms: string[]
  popularShare: number
  popularMinPlays: number
  welcomeGiftEveryDays: number
  dailyRewards: DailyWeight[]
  streakDays: number
  streakBonus: number
  sharePoints: number
  shareMaxPerDay: number
  shareJoinBonus: number
  episodesPerUnlock: number
  platformUnlockHours: number
  prices: PlanPrices
}

export type PlanPatch = Partial<Omit<Plan, 'version' | 'prices'>> & { prices?: Partial<PlanPrices> }

export interface SettingsSource {
  id: string
  name: string
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
  plan: Plan
  sources: SettingsSource[]
}

export type SettingsPatch = Partial<Omit<Config, 'configured' | 'hasPassword' | 'plan' | 'sources'>> & {
  password?: string
  plan?: PlanPatch
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

// free: not VIP content; vip: VIP content this account can't watch yet; unlocked: VIP content it can watch.
export type AccessLevel = 'free' | 'vip' | 'unlocked'

export interface UnlockOption {
  kind: 'series' | 'episodes' | 'platform'
  cost: number
  fromEp?: number
  toEp?: number
  ref?: string
  hours?: number
}

// 403 body of /api/shows/:bookId/stream/:index when the episode is locked.
export interface LockedEpisode {
  error: 'vip_required'
  reason: 'platform' | 'popular'
  bookId: string
  source: string | null
  episode: number
  options: UnlockOption[]
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function lockedEpisodeOf(err: unknown): LockedEpisode | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null
  const body = err.body as Partial<LockedEpisode> | null
  return body && body.error === 'vip_required' && Array.isArray(body.options) ? (body as LockedEpisode) : null
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
  source?: string | null
  sourceName?: string | null
  access?: AccessLevel
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

export type BrowseSort = 'latest' | 'popular' | 'name' | 'episodes'

export interface BrowseSource {
  id: string
  name: string
  type: string
}

export interface BrowseSources {
  activeSourceId: string
  sources: BrowseSource[]
}

export interface BrowseCategory {
  name: string
  count: number
}

export interface BrowseCategories {
  source: string
  categories: BrowseCategory[]
}

export interface LatestParams {
  source?: string
  tag?: string
  sort?: BrowseSort
}

export interface Episode {
  index: number
  chapterId: string
  name: string
  downloaded: boolean
  downloadStatus?: DownloadStatus
  access?: AccessLevel
}

export interface Page<T> {
  items: T[]
  hasMore: boolean
}

export interface Suggestion {
  bookId: string
  name: string
  cover: string
  source: string | null
  sourceName: string | null
  tags: string[]
}

export interface SearchCategory {
  name: string
  count: number
}

export interface SearchSuggestions {
  items: Suggestion[]
  categories: SearchCategory[]
}

export interface SearchPlatform {
  id: string
  name: string
  count: number
}

export interface SearchError {
  source: string
  name: string
  error: string
}

export interface SearchResults extends Page<Show> {
  platforms: SearchPlatform[]
  errors: SearchError[]
}

export interface ShowDetail {
  show: Show | null
  episodes: Episode[]
  source?: string | null
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

export interface AdminAccount {
  id: number
  username: string
  role: AccountRole
  tier: AccountTier
  vipUntil: string | null
  disabled: boolean
  mustChangePassword: boolean
  hasPassword: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface AdminUserRow extends AdminAccount {
  profileCount: number
  deviceCount: number
}

export interface AdminWatchSeconds {
  total: number
  d7: number
  d30: number
}

export interface AdminActivitySummary {
  account: { id: number; username: string; role: AccountRole; disabled: boolean; lastLoginAt: string | null }
  profiles: number
  watchSeconds: AdminWatchSeconds
  lastActiveAt: string | null
  currentlyWatching: number
  favourites: number
}

/** The activity endpoints send only bookId, name and cover for shows the server has not cached. */
export type ActivityShow = Pick<Show, 'bookId' | 'name' | 'cover'> & Partial<Omit<Show, 'bookId' | 'name' | 'cover'>>

export interface ActivityCurrent {
  show: ActivityShow
  episodeIndex: number
  position: number
  duration: number
  percent: number
  kind: 'stream' | 'download'
  updatedAt: string
}

export interface ActivityWatched {
  show: ActivityShow
  episodes: number
  lastWatchedAt: string
}

export interface ActivityDay {
  day: string
  seconds: number
}

export interface ActivityProfile {
  id: number
  name: string
  color: string
  watchSeconds: AdminWatchSeconds
  daily: ActivityDay[]
  currentlyWatching: ActivityCurrent[]
  watched: ActivityWatched[]
  favourites: ActivityShow[]
}

export interface AdminUserActivity {
  account: AdminAccount
  devices: Device[]
  profiles: ActivityProfile[]
}

export type RewardReason =
  | 'daily_reward'
  | 'streak_bonus'
  | 'share'
  | 'share_join'
  | 'shop_series'
  | 'shop_episodes'
  | 'shop_platform'

export interface DailyReward {
  kind: 'points' | 'episodes' | 'series'
  value: number
  bookId?: string
  name?: string
  source?: string | null
  fromEp?: number
  toEp?: number
}

export interface RewardUnlock {
  kind: 'series' | 'episodes' | 'platform'
  ref: string
  name: string
  fromEp: number | null
  toEp: number | null
  expiresAt: string | null
  reason: string | null
}

export interface RewardHistoryItem {
  id: number
  delta: number
  reason: RewardReason | string
  ref: string | null
  createdAt: string
}

export interface RewardsSummary {
  vip: boolean
  balance: number
  streak: number
  daily: { claimed: boolean; reward: DailyReward | null }
  shares: { today: number; max: number }
  gifts: { bookId: string; name: string; source: string | null }[]
  unlocks: RewardUnlock[]
  history: RewardHistoryItem[]
  rules: {
    prices: PlanPrices
    sharePoints: number
    shareJoinBonus: number
    streakDays: number
    streakBonus: number
    episodesPerUnlock: number
    platformUnlockHours: number
    vipPlatforms: string[]
  }
}

export interface DailyResult {
  reward: DailyReward
  streak: number
  bonus: number
  balance: number
}

export interface ShareLink {
  code: string
  path: string
}

export interface ShareCompleteResult {
  points: number
  sharesToday: number
  maxPerDay: number
  balance: number
}

export interface ShopInput {
  kind: 'series' | 'episodes' | 'platform'
  bookId?: string
  source?: string
  fromEp?: number
}

export interface ShopResult {
  cost: number
  unlock: RewardUnlock
  balance: number
}

export interface CreatedUser {
  account: AdminAccount
  tempPassword: string
}

export type AppEvent =
  | { type: 'open' }
  | { type: 'download'; item: DownloadItem }
  | { type: 'library'; bookId: string }
  | { type: 'notification' }

function handleUnauthorized() {
  if (window.location.pathname === '/login') return
  const next = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?reason=expired&next=${encodeURIComponent(next)}`)
}

function handlePasswordChangeRequired() {
  if (window.location.pathname !== '/') window.location.assign('/')
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
    if (res.status === 401 && code === 'sign_in_required') handleUnauthorized()
    if (res.status === 403 && code === 'password_change_required') {
      handlePasswordChangeRequired()
      throw new ApiError('Set a new password to continue.', res.status, data)
    }
    if (res.status === 403 && code === 'profile_required') {
      handleProfileRequired()
      throw new ApiError('Choose a profile to continue.', res.status, data)
    }
    if (res.status === 403 && code === 'admin_required') throw new ApiError(ADMIN_REQUIRED_MESSAGE, res.status, data)
    throw new ApiError(code ?? `Request failed (${res.status})`, res.status, data)
  }
  return data as T
}

function progressPath(downloadId: number | string) {
  return `/api/progress/${enc(String(downloadId))}`
}

function watchPath(bookId: string, index: number) {
  return `/api/watch/${enc(bookId)}/${index}`
}

export type ClientPlaybackEvent =
  | 'stream_url_failed'
  | 'media_error'
  | 'hls_fatal'
  | 'watchdog_timeout'
  | 'stall_timeout'
  | 'play_rejected'
  | 'fullscreen_failed'

export interface ClientLogPayload {
  event: ClientPlaybackEvent
  platform?: string
  bookId?: string
  episode?: number
  code?: number
  message?: string
  details?: string
  /** Host only; the server drops anything else. */
  src?: string
}

// Telemetry must never break playback, so this never throws and never waits for a reply.
function sendClientLog(payload: ClientLogPayload): void {
  try {
    const userAgent = navigator.userAgent
    const body = JSON.stringify({ ...payload, ...parseUserAgent(userAgent), userAgent })
    if (typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon('/api/client-log', new Blob([body], { type: 'application/json' }))
      if (sent) return
    }
    void fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Telemetry is best effort.
  }
}

const enc = encodeURIComponent

export const api = {
  clientLog: sendClientLog,

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

  login: (username: string, password: string) =>
    request<{ account: AccountSummary }>('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>('/api/account/password', { method: 'POST', body: { current, next } }),
  account: () => request<{ account: Account; unread: number }>('/api/account'),
  devices: () => request<{ items: Device[] }>('/api/account/devices'),
  removeDevice: (id: string) => request<{ ok: true }>(`/api/account/devices/${enc(id)}`, { method: 'DELETE' }),
  notifications: () => request<{ items: AppNotification[]; unread: number }>('/api/account/notifications'),
  markNotificationsRead: (ids?: number[]) =>
    request<{ ok: true; unread: number }>('/api/account/notifications/read', {
      method: 'POST',
      body: ids ? { ids } : {},
    }),

  home: (refresh = false) => request<HomeData>(refresh ? '/api/home?refresh=1' : '/api/home'),
  browseSources: () => request<BrowseSources>('/api/browse/sources'),
  categories: (source?: string) =>
    request<BrowseCategories>(`/api/browse/categories${source ? `?source=${enc(source)}` : ''}`),
  latest: (page = 1, { source, tag, sort }: LatestParams = {}) => {
    const query = new URLSearchParams({ page: String(page) })
    if (source) query.set('source', source)
    if (tag) query.set('tag', tag)
    if (sort) query.set('sort', sort)
    return request<Page<Show>>(`/api/browse/latest?${query.toString()}`)
  },
  search: (q: string, page = 1, source?: string, local = false) => {
    const query = new URLSearchParams({ q, page: String(page) })
    if (source) query.set('source', source)
    if (local) query.set('local', '1')
    return request<SearchResults>(`/api/search?${query.toString()}`)
  },
  suggest: (q: string) => request<SearchSuggestions>(`/api/search/suggest?q=${enc(q)}`),
  show: (bookId: string, source?: string) =>
    request<ShowDetail>(`/api/shows/${enc(bookId)}${source ? `?source=${enc(source)}` : ''}`),
  stream: (bookId: string, index: number, source?: string) =>
    request<{ url: string; hls: boolean }>(`/api/shows/${enc(bookId)}/stream/${index}${source ? `?source=${enc(source)}` : ''}`),

  social: (bookId: string) => request<ShowSocial>(`/api/shows/${enc(bookId)}/social`),
  setLike: (bookId: string, liked: boolean) =>
    request<ShowSocial>(`/api/shows/${enc(bookId)}/like`, { method: liked ? 'PUT' : 'DELETE' }),
  setFollow: (bookId: string, following: boolean, source?: string) =>
    request<ShowSocial>(`/api/shows/${enc(bookId)}/follow`, {
      method: following ? 'PUT' : 'DELETE',
      body: following ? { source: source ?? null } : undefined,
    }),

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
  watchProgress: (bookId: string) => request<{ items: StreamProgress[] }>(`/api/watch/${enc(bookId)}`),
  watchContinue: () => request<{ items: StreamContinueItem[] }>('/api/watch/continue'),
  saveWatch: (bookId: string, index: number, position: number, duration: number, source?: string) =>
    request<{ ok: true; progress: ProgressInfo }>(watchPath(bookId, index), {
      method: 'PUT',
      body: { position, duration, source },
    }),
  saveWatchBeacon: (bookId: string, index: number, position: number, duration: number, source?: string): boolean => {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false
    const blob = new Blob([JSON.stringify({ position, duration, source })], { type: 'application/json' })
    return navigator.sendBeacon(watchPath(bookId, index), blob)
  },

  health: () => request<Health>('/api/health'),

  getRewards: () => request<RewardsSummary>('/api/rewards'),
  claimDaily: () => request<DailyResult>('/api/rewards/daily', { method: 'POST' }),
  createShare: (bookId: string, source?: string) =>
    request<ShareLink>('/api/rewards/share', { method: 'POST', body: { bookId, source: source ?? null } }),
  completeShare: (code: string) =>
    request<ShareCompleteResult>('/api/rewards/share/complete', { method: 'POST', body: { code } }),
  shopPurchase: (input: ShopInput) => request<ShopResult>('/api/rewards/shop', { method: 'POST', body: input }),

  adminUsers: () => request<{ items: AdminUserRow[] }>('/api/admin/users'),
  adminActivity: () => request<{ items: AdminActivitySummary[] }>('/api/admin/activity'),
  adminUserActivity: (id: number) => request<AdminUserActivity>(`/api/admin/users/${id}/activity`),
  createAdminUser: (username: string, role: AccountRole) =>
    request<CreatedUser>('/api/admin/users', { method: 'POST', body: { username, role } }),
  updateAdminUser: (
    id: number,
    patch: { role?: AccountRole; disabled?: boolean; tier?: AccountTier; vipUntil?: string | null },
  ) =>
    request<{ account: AdminAccount }>(`/api/admin/users/${id}`, { method: 'PATCH', body: patch }),
  resetAdminUserPassword: (id: number) =>
    request<{ tempPassword: string }>(`/api/admin/users/${id}/reset-password`, { method: 'POST' }),
  deleteAdminUser: (id: number) => request<{ ok: true }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
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
  es.addEventListener('notification', () => emit({ type: 'notification' }))
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
