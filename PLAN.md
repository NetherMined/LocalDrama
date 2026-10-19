# Dramabox Server — Implementation Plan

Source spec: `Dramabox-Server-Specification.md`. This plan resolves the spec's open choices and records findings about the upstream API.

## Findings that shape the design

1. **Upstream API is geo/WAF-blocked from the dev network.** `sapi.dramaboxdb.com` returns Akamai `403 Access Denied` during token generation (tested 2026-10-19 from ZA). Image CDN (`hwztchapter.dramaboxdb.com`) is reachable. Running for real requires an outbound proxy (HTTP or SOCKS5) outside ZA. `@zhadev/dramabox@0.0.2` has **no proxy option** despite its README and the spec: a `proxy` constructor option is silently ignored. In Node it issues every request via `https.request(...)` with its own `https.Agent` (custom ciphers, `rejectUnauthorized:false`).
2. **`getDramaDetail` / `getDramaDetailV2` / `getRelatedDramas` are broken upstream** (return "Drama not found" even in the author's recorded examples). Drama detail must be composed from:
   - a local `shows` cache populated from every list/search response, plus
   - `getChapters(bookId)` for the episode list.
3. **Response shapes are inconsistent** across endpoints (`bookName` vs `name`, `coverWap` vs `cover`, `tagV3s[]` objects vs `tags[]` strings, `results` vs `items` vs bare arrays). A normalizer is required.
4. **Video URLs are signed and expire.** `getChapters` returns `cdnList[].videoPathList[]` with qualities 1080 (VIP-only, `isVipEquity:1`), 720 (default), 540, 360, 144. Download URLs must be resolved **at download time**, not at enqueue time.
5. Chapter indexes are **0-based** in `getChapters`/`batchDownload`; `getStreamUrl(bookId, n)` uses the same index.

## Resolved decisions

| Topic | Decision |
|---|---|
| Layout | npm workspaces monorepo: `server/` (Node 22, Fastify 5, plain ESM JS) and `web/` (React 19 + Vite + TypeScript + Tailwind v4 + React Router) |
| DB | SQLite via `better-sqlite3` |
| Config/DB location | `DATA_DIR` env, default `./data/` (config.json + library.db). Not inside the download root, since the root is unknown until setup completes. |
| Progress transport | Server-Sent Events (`GET /api/events`) |
| Port / bind | `0.0.0.0:8096`, overridable with `PORT` / `HOST` env |
| Prod serving | Fastify serves `web/dist` statically + SPA fallback; one process |
| Dev | `npm run dev` runs Fastify (`node --watch`) and Vite (proxy `/api` and `/media` to 8096) concurrently |
| Mock mode | `DRAMABOX_MOCK=1` makes the provider serve recorded fixtures (`server/fixtures/*.json`). Video URLs point to `/__mock/sample.mp4`, so the full download → library → playback loop can be tested offline. |
| File naming | `<root>/<Show>/<Show> - E01 - <Episode Title>.mp4`, sanitized for Windows (strip `<>:"/\|?*`, trailing dots/spaces, reserved names) |
| Download quality | Preferred quality setting (default 720). Pick the highest non-VIP entry ≤ preferred from the default CDN, falling back to other CDNs, then to `getStreamUrl`. |
| Proxy | Optional `proxyUrl` in config (`http://`, `https://`, `socks5://`, `socks5h://`, with optional `user:pass@`); env `DRAMABOX_PROXY` overrides. `server/src/proxy.js` builds an agent via `https-proxy-agent` / `socks-proxy-agent` and **patches `https.request`/`https.get`** so any request to a `*.dramaboxdb.com` or `*.webfic.com` host uses the proxy agent, copying the client's TLS options (ciphers, rejectUnauthorized) into the request options. MP4 downloads use the same agent (Node `https`, not global `fetch`). Agent is rebuilt when the setting changes. No direct fallback when a proxy is configured, except if the user turns the proxy off. Credentials never sent to the web client (masked as `***`). |
| Client construction | `new DramaboxClient({ proxy, requestDelay, language, timeout: 45000, maxRetries: 3, cacheTTL: 300 })`. `proxy` is passed for forward-compat but ignored by v0.0.2; routing is done by `proxy.js`. Env overrides: `DRAMABOX_PROXY`, `REQUEST_DELAY`, `DRAMABOX_LANG`. |
| Rate limiting | Client `requestDelay` from config (default 2000 ms); concurrency default 1 |

## API contract (server ↔ web)

All JSON. Errors: `{ error: string }` with 4xx/5xx.

```
GET  /api/status                 -> { configured: bool, mock: bool, version, lanUrls: string[] }
GET  /api/setup/defaults         -> { suggestedRoot: string, languages: {code,label}[] }
POST /api/setup/validate-path    { path } -> { ok: bool, error?: string, resolved: string }
POST /api/setup/test-proxy       { proxyUrl } -> { ok: bool, ip?: string, country?: string, apiOk: bool, error?: string }
                                 (egress IP/country via https://ipinfo.io/json through the proxy; apiOk = token generation succeeds through it)
POST /api/setup                  { downloadRoot, language, proxyUrl?, requestDelay?, concurrency?, quality? } -> { ok: true }
GET  /api/settings               -> Config
PUT  /api/settings               Partial<Config> -> Config

GET  /api/browse/latest?page=1   -> { items: Show[], hasMore: bool }
GET  /api/search?q=&page=1       -> { items: Show[], hasMore: bool }
GET  /api/search/suggest?q=      -> { items: { bookId, name, cover }[] }
GET  /api/shows/:bookId          -> { show: Show | null, episodes: Episode[] }   (show from cache; episodes from getChapters, cached 10 min)

GET  /api/downloads              -> { items: DownloadItem[] }
POST /api/downloads              { bookId, episodes?: number[] }  (omit = all) -> { added: number }
DELETE /api/downloads/:id        -> { ok: true }  (removes queued/failed item)
POST /api/downloads/:id/retry    -> { ok: true }

GET  /api/library                -> { shows: (Show & { downloaded: number })[] }
GET  /api/library/:bookId        -> { show, episodes: LibraryEpisode[] }
GET  /media/:episodeId           -> MP4 bytes with HTTP Range support (206)

GET  /api/events                 -> SSE. events: `download` (DownloadItem), `library` ({ bookId })
```

Types:
```ts
Show          { bookId, name, cover, introduction, episodeCount, playCount, tags: string[], status? }
Episode       { index, chapterId, name, downloaded: bool, downloadStatus?: Status }
Status        'queued' | 'downloading' | 'completed' | 'failed'
DownloadItem  { id, bookId, showName, episodeIndex, episodeName, status, bytesDone, bytesTotal, error?, filePath?, createdAt, updatedAt }
LibraryEpisode{ id, episodeIndex, name, filePath, size, mediaUrl }
Config        { downloadRoot, language, proxyUrl, requestDelay, concurrency, quality, configured }   (proxyUrl password masked in GET responses; PUT with a masked value keeps the stored one)
```

DB tables: `shows` (cache, upserted from every list response), `downloads` (queue + history; unique on bookId+episodeIndex), `settings` lives in `config.json`.

## Phases

### Phase 1: MVP (spec Phase 1)
- Monorepo scaffold, scripts (`dev`, `build`, `start`).
- Config store + first-run Setup Wizard (download root with write-permission check, language, **proxy URL with "Test connection"**, delay/concurrency, shows LAN URLs).
- Proxy routing for all Dramabox API calls and MP4 downloads (`server/src/proxy.js`).
- Dramabox provider (real + mock) with normalizer and show cache.
- Search page with suggestions; Latest browse grid; drama detail page with episode list and checkboxes.
- Download queue: SQLite-persisted, worker with concurrency limit, streams to `*.part` then renames, progress via SSE, resolves URLs at download time, re-queues `downloading` items on restart.
- Downloads page (status + progress bars, retry, remove).
- Library page + HTML5 player streaming local files with Range support.
- LAN binding + LAN URL detection.
- **Verify:** proxy routing tested against a local CONNECT proxy (requests observed passing through it); in mock mode, run setup → search → queue 2 episodes → files appear on disk with correct names → play in browser; `npm run build && npm start` serves everything on :8096.

### Phase 2: Polish (spec Phase 2)
- Netflix-style homepage: hero banner + horizontal rows (Latest, Trending, For You, Recommended, Coming Soon, Indonesian Dubbed, VIP).
- Queue controls: pause/resume (HTTP Range resume of `.part`), retry-with-backoff, clear completed.
- Library scan of the download folder on startup and on demand (picks up files not in DB).
- Rate-limit awareness: global request throttle, exponential backoff on upstream errors, clear error banners (including "API blocked in your region").
- Optional admin password (session cookie), configurable in setup and settings.
- Settings page.

#### Phase 2 spec

**Home rows.** `GET /api/home -> { hero: Show | null, rows: { key, title, items: Show[] }[], errors: { key, error }[] }`. Rows in this order: `trending` (Trending Now), `latest` (Latest), `foryou` (For You, page 1), `recommended` (Recommended), `comingsoon` (Coming Soon), `dubindo` (Indonesian Dubbed, `getDubIndo('terpopuler', 1, 20)`), `vip` (VIP). Calls are sequential, since the client throttles. The result is cached for 15 min in memory, and `?refresh=1` bypasses the cache. A failing row is skipped and listed in `errors`. If every row fails, respond 502 with the first error. Hero = first trending item that has an introduction. All items are upserted into the `shows` cache.

**Downloads.**
- New status `paused`. `Status = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'`.
- `POST /api/downloads/:id/pause`: if downloading, abort the stream but keep the `.part` file; if queued, mark it paused.
- `POST /api/downloads/:id/resume`: set queued; the worker resumes from the `.part` size with a `Range: bytes=<size>-` request. If the reply is a 206, append to the file; if it is a 200, start over.
- `POST /api/downloads/pause-all`, `POST /api/downloads/resume-all`.
- **Auto retry.** New columns `attempts` (int) and `nextAttemptAt` (ms, nullable). On a transient error (network failure, 5xx, timeout, expired URL 403) the job is re-queued with backoff of 10 s, 60 s, then 300 s (4 attempts in total), and the worker skips rows whose `nextAttemptAt` is in the future. After the 4th failed attempt the status becomes `failed`. Manual retry resets attempts.
- `POST /api/downloads/clear-completed` sets a new column `cleared = 1` on completed rows. `GET /api/downloads` excludes cleared rows. The library is unaffected.
- `DownloadItem` gains `attempts` and `nextAttemptAt`.

**Library.**
- At download time, write `<show folder>/show.json` (`{ bookId, name, cover, introduction, tags, episodeCount }`) and `<show folder>/poster.jpg` (the cover image, fetched through the proxy when the host matches; failures are ignored). These sidecars also help Jellyfin/Plex.
- `POST /api/library/scan -> { added, removed }`. Also runs on startup once configured.
  - Walk the download root one level of show folders, looking for `*.mp4` matching `^(.*) - E(\d+)(?: - (.*))?\.mp4$`. The bookId comes from `show.json`; if there is none, use `local-<sanitized folder name>`, and create a `shows` row from the folder name, using `poster.jpg` if present.
  - Insert missing files as completed rows with `cleared = 1`.
  - Delete completed rows whose file no longer exists.
- `Show.cover` may be the local `/api/library/poster/:bookId` route (served from the folder) for local-only shows.
- `DELETE /api/library/episodes/:id`: delete the file and the row. When the show folder has no mp4s left, also remove `show.json`, `poster.jpg`, and the folder if it is empty.

**Upstream health and backoff.**
- The provider retries a transient upstream failure (anything except 403/blocked and "not found") twice, with 2 s then 4 s backoff.
- It records `upstream = { ok, error?, at }` after every call.
- `GET /api/status` adds `upstream` and also `authRequired: bool, authenticated: bool`.

**Admin password.**
- Config gains `passwordHash` (`scrypt` with a random salt, stored as `salt:hash` hex; never sent to the client). GET /api/settings returns `hasPassword: bool` instead.
- `POST /api/setup` and `PUT /api/settings` accept `password` (a non-empty string sets it; `''` removes it). Changing it via settings requires the current session when a password is already set.
- `POST /api/auth/login { password } -> { ok }` sets cookie `dbx_session=<random 32-byte hex>`, with `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`. Sessions are stored in a new `sessions` table (token, createdAt). `POST /api/auth/logout` clears it.
- When a password is set, every `/api/*` route except `/api/status` and `/api/auth/*` returns 401 `{ error: 'unauthorized' }` without a valid session. `/media/*` and `/api/events` are covered too. Cookies are parsed manually; no new deps.
- Login attempts are throttled to 5 per minute per IP.

**Web.**
- **Home:** a hero banner (large blurred cover backdrop, title, intro clamp, "View" and "Download all" buttons) and horizontal snap-scrolling rows of cards with arrow buttons on desktop. The previous Latest grid moves to `/browse`. Row errors show as small muted notes.
- **Login page** `/login`: the guard sends users there when `authRequired && !authenticated`. Any 401 also redirects to `/login`.
- **Downloads page:** pause/resume per item, Pause all / Resume all / Clear completed, a paused pill, and "retrying in Ns" when `nextAttemptAt` is set.
- **Library:** a delete-episode action (with confirm) and a "Scan library" button.
- **Settings page** `/settings`: download root (validate), language, proxy plus Test connection, request delay, concurrency, quality, password set/change/remove, LAN URLs, "Scan library". Linked from the nav (gear icon) and a Log out button when auth is enabled. The setup wizard gets an optional password step.
- **Global banner:** shown when `status.upstream.ok === false` with the error. Status is refetched every 60 s, and the banner links to Settings when the error is a region block.

**Verify (Phase 2):** in mock mode:
- home returns all 7 rows;
- pause mid-download, then resume, finishes with a valid file (ffprobe OK, size matches);
- an injected transient failure auto-retries;
- clear-completed hides rows but the library keeps them;
- after deleting the DB, a scan restores the library from disk and sidecars;
- with a password set: API 401 without cookie, login works, media is 401 without cookie;
- web builds clean.

### Phase 3: Advanced (spec Phase 3)
- Multi-user profiles with PIN.
- Watch progress / continue watching / auto-next episode.
- Jellyfin/Plex library refresh hooks (URL + API key in settings).
- Dockerfile + docker-compose.yml (volume for data + media).
- `/api/health`, optional mDNS advertising ("Dramabox Server").
- README.md with run, Docker, and proxy instructions. "Automatic updates" is out of scope; document using `docker compose pull` or Watchtower instead.

#### Phase 3 spec

**Profiles (Netflix-style "Who's watching?").** The admin password from Phase 2 still gates the whole server. Profiles sit on top of it.
- Table `profiles(id INTEGER PK, name TEXT UNIQUE, color TEXT, pinHash TEXT NULL, isAdmin INT, createdAt)`. On startup, if the table is empty, create profile `{ name: 'Me', color: '#e11d48', isAdmin: 1 }`, so existing installs keep working. The last admin cannot be deleted or demoted.
- Profile type: `Profile { id, name, color, hasPin, isAdmin }`. `pinHash` is never sent to the client.
- PINs are 4–6 digits, stored as a scrypt hash in the same format as the password, with selection attempts throttled to 5 per minute per profile.
- Profile sessions: cookie `dbx_profile=<random hex>` (HttpOnly; SameSite=Lax; Path=/; 30 days), stored in table `profile_sessions(token PK, profileId, createdAt)`.
  - **Current profile** = the valid cookie's profile.
  - If there is no valid cookie and exactly one profile exists with no PIN, that profile is used implicitly.
  - Otherwise there is no current profile, and routes that need one return 403 `{ error: 'profile_required' }`.
- Endpoints:
  - `GET /api/profiles -> { items: Profile[] }`: allowed without a profile selected, but still behind the admin password.
  - `POST /api/profiles/:id/select { pin? } -> { profile }`: sets the cookie. A wrong PIN returns 401 `{ error: 'invalid_pin' }`.
  - `POST /api/profiles/signout`: clears the cookie.
  - `POST /api/profiles { name, color?, pin?, isAdmin? }`, `PUT /api/profiles/:id { name?, color?, pin? ('' removes), isAdmin? }`, `DELETE /api/profiles/:id`: admin only. A non-admin may also PUT their own name, color and pin.
- `GET /api/status` adds `profile: Profile | null` and `profileRequired: bool`. `profileRequired` is true when there is no current profile.
- **Admin-only routes** (403 `{ error: 'admin_required' }` for a non-admin current profile): `PUT /api/settings`, `GET /api/settings`, `POST /api/setup/test-proxy` (once configured), `POST /api/library/scan`, `DELETE /api/library/episodes/:id`, profile management, and `/api/integrations/*`.
- Non-admins can browse, search, queue, pause and resume downloads, and watch.
- Profile-scoped routes (they need a current profile): `/api/progress/*`.

**Watch progress.**
- Table `progress(profileId, downloadId, bookId, episodeIndex, position REAL, duration REAL, completed INT, updatedAt, PRIMARY KEY(profileId, downloadId))`.
- `PUT /api/progress/:downloadId { position, duration }`: upsert. `completed = position >= duration * 0.92 || (duration >= 60 && duration - position < 15)`.
- `GET /api/progress/continue -> { items: { show: Show, episode: LibraryEpisode, position, duration }[] }`: for each show, take this profile's most recently updated progress row.
  - If that row is not completed, return it.
  - If it is completed and a later downloaded episode exists, return that next episode with position 0.
  - Otherwise skip the show.
  - Ordered by updatedAt desc, max 20.
- `LibraryEpisode` gains `progress: { position, duration, completed } | null` for the current profile, which is null when there is no profile.
- Deleting a library episode deletes its progress rows. Deleting a profile deletes its progress and sessions.

**Media server integrations.**
- Config gains `integrations: { jellyfin: { enabled, url, apiKey }, plex: { enabled, url, token, sectionId } }`. Defaults are disabled with empty strings.
- Secrets are masked as `***` in GET /api/settings, using the same keep-if-masked rule as proxyUrl on PUT.
- After downloads complete, a refresh is debounced per integration to **30 s after the last completion**, so a full series triggers one refresh.
  - **Jellyfin:** `POST {url}/Library/Refresh` with header `X-Emby-Token: <apiKey>`.
  - **Plex:** if sectionId is set, `GET {url}/library/sections/{sectionId}/refresh`; otherwise fetch `GET {url}/library/sections` (Accept: application/json) and refresh every section. Each call sends header `X-Plex-Token`.
- These are LAN calls: use global fetch, never the proxy. Use a 10 s timeout.
- Failures are logged and stored as `lastResult: { ok, at, error? }` per integration, exposed in settings.
- `POST /api/integrations/test { type: 'jellyfin'|'plex', url?, apiKey?/token? }`: masked values fall back to the stored ones.
  - **Jellyfin:** `GET {url}/System/Info` with the token gives `{ ok, name: ServerName, version: Version }`.
  - **Plex:** `GET {url}/identity` and `/library/sections` give `{ ok, version, sections: { id, title }[] }`.
- `POST /api/integrations/refresh { type }` triggers a refresh immediately.

**Health and mDNS.**
- `GET /api/health`: public, no auth, leaks no paths or secrets. Returns `{ ok, version, uptime, configured, db: 'ok'|'error', queue: { queued, downloading, paused, failed }, upstream: { ok }, disk: { freeBytes, totalBytes } | null }`. Disk figures come from `fs.statfs(downloadRoot)`. Responds 503 with `ok: false` if the DB check (`SELECT 1`) fails.
- Config `mdns: true` (default). When true, advertise with `bonjour-service` (already installed in server/): `{ name: 'Dramabox Server', type: 'http', port, txt: { path: '/', version } }`. Restart or stop the advertisement when the setting changes, and unpublish on SIGINT/SIGTERM. Fail silently, with a log line, if multicast is unavailable.

**Docker.**
- `Dockerfile` at the repo root, multi-stage on `node:22-bookworm-slim`.
  - Build stage: `cd web && npm ci && npm run build`.
  - Runtime stage: `cd server && npm ci --omit=dev`, copy `server/` and `web/dist`.
  - `ENV DATA_DIR=/data DEFAULT_DOWNLOAD_ROOT=/media HOST=0.0.0.0 PORT=8096`, `EXPOSE 8096`, `VOLUME ["/data", "/media"]`.
  - `HEALTHCHECK` with node fetching `/api/health`. Run as the `node` user, and `CMD ["node", "server/src/index.js"]`.
- `.dockerignore` excludes node_modules, data, web/dist, and *.part.
- `docker-compose.yml`:
  - service `dramabox`, build `.`, `restart: unless-stopped`, ports `8096:8096`;
  - volumes `./data:/data` and `${MEDIA_DIR:-./media}:/media`;
  - env `DRAMABOX_PROXY`, `REQUEST_DELAY`, `DRAMABOX_LANG`, and `TZ`.
  - Comment that mDNS needs `network_mode: host` (Linux only).
- `/api/setup/defaults` suggestedRoot honours `DEFAULT_DOWNLOAD_ROOT` when set.
- For lockfiles: the root and each folder keep their own `package-lock.json` (needed for `npm ci`).

**Web.**
- `/profiles` "Who's watching?": a grid of large colored avatar tiles (initial letter), keyboard and remote friendly. A PIN profile opens an accessible PIN-pad dialog (digits plus a typed fallback) that shows invalid_pin errors.
  - Admins see "Manage profiles": add, edit (name, 8 preset colors, PIN set/remove, admin toggle) and delete (with confirm).
  - The guard sends the user to /profiles when `status.profileRequired` (after the configured and auth checks), and a 403 `profile_required` from any call redirects there.
- **Nav:** a current-profile avatar button with a menu: Switch profile, Settings (admins only), Log out (when auth is enabled). The gear icon is hidden for non-admins.
- **Home:** a "Continue Watching" row first, when non-empty. Cards get a thin progress bar and "E03 · 12 min left", and clicking goes straight to /watch at the saved position.
- **LibraryShow:** a per-episode progress bar and a "Watched" check.
- **Watch:**
  - Seek to the saved position on loadedmetadata, if `position > 5` and the episode is not completed.
  - Save progress every 10 s while playing, on pause, on `visibilitychange`, and on ended (use `navigator.sendBeacon` fallback on unload).
  - In the last 8 s, when a next episode exists, show an "Up next" overlay with a countdown, Play now, and Cancel.
- **Settings:**
  - Hidden for non-admins, who are redirected to `/`.
  - A new "Media servers" section: a Jellyfin card (enabled, URL, API key, Test, Refresh now, last result) and a Plex card (enabled, URL, token, Test which lists sections in a select for sectionId, Refresh now, last result).
  - Network gets an "Advertise on network (mDNS)" toggle.
  - A new "System" section reads /api/health: version, uptime, disk free, and queue counts.
  - A "Profiles" link goes to `/profiles?manage=1`.

**Verify (Phase 3).** In mock mode:
- Fresh DB: a default profile exists, and the status shows `profileRequired: false`.
- Create a second profile with a PIN; then profileRequired becomes true, a wrong PIN gives 401, and the right PIN sets the cookie.
- A non-admin gets 403 on PUT /api/settings.
- Progress PUT/continue works, including the next-episode logic after a completed episode.
- Integrations against a local stub server (a node http server on a scratch port that records requests): a Jellyfin test and debounced refresh (header checked), and a Plex refresh of all sections.
- `/api/health` returns 200 without auth, even with a password set.
- mDNS: `bonjour-service` find from a separate node script sees "Dramabox Server".
- Docker: `docker build` succeeds and `docker compose up -d` serves `/api/health` healthy on a test port. Then tear it down.
- The web build is clean.
