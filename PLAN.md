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

---

# Ticket: Platform activation fix, streaming-style UI, Browse filters (2026-10-20)

## Review findings
- **"This platform is not supported yet. Supported GoodBos platforms: DramaBox and NetShort."** comes from the
  *committed* `server/src/routes/sources.js`. The working tree already replaces it with a 22-adapter registry
  (`server/src/platforms/*`), but the running container `dramaus-dramabox-1` (:8096) was built from the old code —
  `server/src/platforms/` does not exist inside it. The fix is a rebuild, not new code.
- Activation for GoodBos sources now runs a full smoke test (browse → episodes → stream byte). Platforms whose
  upstream is down will fail with `Source test failed: …` (502) instead — that is expected, not the old bug.
- `home.js` only fetches the *active* source; other enabled platforms are skipped. Browse has no query params.
- Shows already carry `tags[]` (normalized from tagV3s/tags/category/genre), which is what filters can build on.

## Phase 1 — Rebuild & verify platform activation (no UI changes)
1. `docker compose build && docker compose up -d` so the container runs the working-tree server.
2. Verify inside the container: `server/src/platforms/` exists; `GET /api/sources` lists all 22 GoodBos platforms.
3. Run `POST /api/sources/:id/test` against every platform; record which pass / fail and why.
4. Small server fixes only if the sweep shows them:
   - `vibeshort.goodbos.online` is mapped by both Storyreel (`hosts`) and Vibeshort — later adapter wins in
     `byHost`; drop it from Storyreel's `hosts` so the label/adapter is unambiguous.
   - Surface the activation error text in the Sources panel (it currently shows the raw message).
5. Commit the platform work.

## Phase 2 — Server: source-aware browse + categories
1. `multiProvider`: `latest/search/trending(page, { sourceId })` — run against a given enabled source, default active.
2. `GET /api/browse/latest?page&source&tag&sort` — `sort` = `latest | popular | name | episodes`; `tag` filters on
   normalized tags (server-side over fetched pages, case-insensitive).
3. `GET /api/browse/categories?source=` — tag counts from the `shows` cache for that source (top 30), so chips are
   instant; refreshed whenever pages are upserted.
4. `/api/home`: one row per enabled platform (cap concurrency at 3, 5-min cache per source), plus
   "Trending Now", "New & Popular", and up to 3 genre rows ("Romance", "Revenge", …) built from the most common tags.

## Phase 3 — Web: streaming-style redesign (matches reference screenshot)
1. **Top nav**: logo left, centred search field, notification bell (download activity) + avatar menu right;
   second line of links: Home · Browse · New & Popular · My List (Favourites) · Library · Downloads · Browse by Platform.
2. **Hero**: full-bleed backdrop (blurred/scaled cover + dark gradient), large title, tags line, Play / More Info,
   and 3 quick-link tiles (New & Popular, Continue Watching, Browse by Platform) like the reference.
3. **Cards**: landscape 16:9 thumbnails (cover `object-cover`, top-anchored) with episode-count badge top-right,
   play-icon hover overlay, title + first tag beneath. Keep a compact "Continue Watching" strip with progress bar.
4. **Rows**: section titles in bold white, horizontal scroll with edge arrow buttons on desktop, snap on mobile.
5. Black (#000/#0b0b0f) background, red accent kept; responsive down to 360px.

## Phase 4 — Web: Browse filters & categories
1. Sticky filter bar: **Platform** select (enabled sources), **Sort** select, **Category** chip row (from
   `/api/browse/categories`, "All" first, horizontally scrollable).
2. State lives in the URL query (`?source=&tag=&sort=`) so filters are shareable/back-button safe.
3. Grid uses the new landscape card; infinite "Load more" retained; empty state per filter ("No Romance dramas on
   ReelShort yet").
4. `npm run build` for web + rebuild container; manual check in browser at :8096.

Each phase stops for confirmation before the next.

---

# Ticket: User accounts, device sign-in, roles and admin activity (2026-10-20)

## Decisions (from user)
- **Accounts own profiles** (Netflix model): an account signs in on a device, then picks one of its profiles.
- **In-app notifications only**: no email; accounts are identified by username.

## Current state
- One optional shared server password (`config.passwordHash`) gates the whole app via an `onRequest` hook;
  sessions table has no owner. Profiles (`profiles` table) carry `isAdmin` + optional PIN and are global.
- Favourites (per profile) and progress (per profile) exist, but progress is only saved for *downloaded* episodes:
  streamed playback (Show page / VideoPlayer) records nothing.
- Download routes have no role check.

## Model
- `accounts(id, username UNIQUE COLLATE NOCASE, passwordHash, role 'admin'|'user', mustChangePassword, disabled,
  createdAt, createdBy, lastLoginAt)`
- `profiles.accountId` (new column). Admin rights move from profile to account role; `profiles.isAdmin` is ignored.
- `devices(id TEXT PK, accountId, name, userAgent, ip, firstSeenAt, lastSeenAt)`. A long-lived `dbx_device`
  cookie identifies the browser; sessions become `sessions(token, accountId, deviceId, createdAt, lastSeenAt)`.
- `notifications(id, accountId, kind, title, body, createdAt, readAt)`.
- `watch_progress(profileId, bookId, episodeIndex, sourceId, position, duration, completed, watchedSeconds,
  updatedAt)` for streams; `watchedSeconds` grows by `min(Δposition, Δwall + 5s)` per save (so seeking or
  leaving a tab open doesn't inflate it). Downloaded playback also adds watched seconds.

## Migration (automatic, on first start)
- Create account `admin` (role admin). Its password = the existing shared server password hash if one is set,
  otherwise `mustChangePassword = 1` and the first visit forces setting one (no default password).
- All existing profiles → `accountId = admin`. Existing global sessions are dropped (everyone signs in once).

## Phase 1: Server: accounts, devices, sessions, roles
1. Schema + migration above; `accounts.js` service (create, verify, change password, reset, disable, delete).
2. `onRequest` gate: every `/api/*` except health, status, `auth/login`, and static assets needs a valid session.
   Unknown device or no session → 401 `sign_in_required`.
3. `POST /api/auth/login {username, password}` → session + device cookie; per-IP and per-username rate limit.
   If the device id is new for that account → notification "New sign-in on <Browser> on <OS>" (UA parsed simply)
   and the device is recorded. `POST /api/auth/logout`.
4. `GET /api/account` (me: username, role, mustChangePassword, unread count), `POST /api/account/password
   {current, next}` (min 8 chars; clears mustChangePassword; signs out other devices), `GET/DELETE
   /api/account/devices[/:id]`, `GET /api/account/notifications`, `POST /api/account/notifications/read`.
5. While `mustChangePassword`, every route except account/password, account, auth, and status returns 403
   `password_change_required`.
6. Profiles scoped to the signed-in account (list/create/update/delete/select only within it).
7. Role checks: `requireAdmin` = account role admin. Applied to all `/api/downloads*` (list, enqueue, retry, pause,
   remove), library scan/delete, sources, settings, and integrations. Users keep browse, stream, library playback,
   favourites, and progress.
8. Admin: `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id` (role, disabled), `POST
   /api/admin/users/:id/reset-password` → temp password returned once and `mustChangePassword = 1`, `DELETE`
   (can't remove/demote the last admin or yourself). Creating a user also creates its default profile and a
   notification "Welcome, change your temporary password on your Account page".

## Phase 2: Server: watch tracking + activity reporting
1. `PUT /api/watch/:bookId/:index {position, duration, source}` for streams (+ beacon POST alias); feeds
   watched seconds; existing download progress also accrues watched seconds.
2. Continue Watching merges streamed + downloaded progress.
3. `GET /api/admin/users/:id/activity` → per profile: currently watching (incomplete, last 14 days, with show
   info + %), watched (completed episodes grouped by show), favourites, total watch time + last 7/30 days,
   last active, devices. `GET /api/admin/activity` → summary row per user for the table.

## Phase 3: Web: sign-in, account page, notifications, role-aware UI
1. Sign-in page (username + password) replaces the shared-password Login; `sign_in_required` anywhere → redirect.
2. Forced "Set a new password" screen when `mustChangePassword`.
3. Profile picker shows only the account's profiles (after sign-in).
4. **Account page** (`/account`): change password, my profiles, **favourites manager** (grid with remove, per
   profile), signed-in devices with "Sign out", sign out everywhere.
5. Bell → notifications dropdown (unread dot; new-device and welcome notices; mark read); downloads activity dot
   only for admins.
6. Non-admins: hide Downloads nav link, download buttons on Show page, Settings; direct visits show "Ask an admin".
7. VideoPlayer saves stream progress every 10 s + on pause/unload via the new watch endpoint.

## Phase 4: Web: admin Users & activity
1. `/admin/users`: table (username, role, status, profiles, last active, watch time 7d), "Create user" dialog
   (username, role, generated temp password shown once with copy button), reset password, disable/enable,
   change role, delete.
2. User detail: per-profile tabs with Currently watching (progress bars), Watched, Favourites, Watch time
   (total / 7d / 30d), Devices.
3. Build, rebuild container, screenshot checks, commit.

Each phase stops for confirmation before the next.

---

# Ticket: Predictive search + installable app (2026-10-20)

## Findings
- Search and suggestions only query the **active** platform's upstream search (`provider.search` → NetShort).
  NetShort's search matches few titles: "love" works; "ceo", "revenge", "he broke" return nothing, though the
  local `shows` cache (~500 shows across 10 platforms) holds 22 "ceo" and 66 "revenge" matches, and
  "He Broke the Heart That Saved Him" is a DramaBox show that is never searched.
- No web manifest, no PNG icons, no service worker. The server is plain http (`http://192.168.1.111:8096`);
  browsers only offer "Install app" over HTTPS (iOS "Add to Home Screen" works over http).
- Smart TVs (Tizen, webOS, Google TV) can't install web apps; a bookmark is the realistic option there.
- Decision (user): HTTPS via **Tailscale** (`tailscale serve`). Tailscale is not installed on this PC yet.

- Player (added): streamed playback on the series page uses `VideoPlayer`, which has **no Up Next overlay and
  no autoplay-next**; those exist only in the downloads player (`Watch.tsx`). `Watch.tsx` requests fullscreen
  from `onLoadedMetadata` (not a user gesture), so browsers reject it; iOS needs `video.webkitEnterFullscreen`.
  The series page has no main Play/Resume button, and the inline player label is 0-based ("Episode 0").

## Phase 1: Player and series page
1. One shared `PlayerShell` used by the series page (streams) and Watch (downloads): a container element that
   owns fullscreen, the `<video>` (HLS-aware), and overlays. Switching episodes swaps the source inside the
   same container, so fullscreen and the overlay survive.
2. **Fullscreen on click**: Play/episode buttons call `container.requestFullscreen()` inside the click handler
   (iOS: `video.webkitEnterFullscreen()`), then `screen.orientation.lock('landscape')` where supported. Exit
   via Esc / button / system gesture; leaving fullscreen keeps playback inline.
3. **Up Next overlay**: in the last 10 s (or on `ended` when the duration is unknown) show a card with next
   episode title, countdown ring, "Play now" and "Cancel"; also a "Next episode" button in the top bar
   while playing. Works for streams (next index from the episode list; stream URL fetched ahead at -15 s)
   and downloads.
4. **Autoplay next**: on end (unless cancelled) load the next episode in place, resume progress saving, and
   update the URL (`?ep=`); stop at the last episode with a "Series finished" card. Setting: autoplay on/off
   (per browser).
5. Top bar overlay: back, show title, "E05 · Episode name", next/prev; auto-hides after 3 s idle; keyboard:
   space/k play-pause, f fullscreen, n next, ←/→ seek 10 s.
6. **Series page**: hero with backdrop, big **Play** (first episode) / **Resume E05 · 12 min left** button that
   opens the player fullscreen, episode count + platform, favourite + download (admin) buttons; episode list
   as a responsive grid with progress bars; 1-based labels everywhere.

## Phase 2: Search that actually finds things
1. Server: SQLite FTS5 index `shows_fts(name, tags, introduction)` kept in sync on `upsertShows` (triggers),
   backfilled on start. Prefix matching per word (`he* bro*`), name weighted above tags/intro (bm25).
2. `GET /api/search/suggest?q=` → local index only (instant, < 20 ms): top 8 `{bookId, name, cover, source,
   sourceName, tags}`; plus up to 3 matching tag names ("Revenge") as category suggestions.
3. `GET /api/search?q=&source=&page=` → fan out to every enabled platform's upstream search in parallel
   (concurrency 4, 8 s timeout each, failures ignored) + local index; merge, dedupe by source:bookId, rank
   local-name matches first; results upserted so the index grows. `source=` narrows to one platform.
4. Web SearchBox: dropdown with cover thumbnails, platform badge, highlighted match, category chips, "Search
   for “q”" row; ↑/↓/Enter/Escape, combobox ARIA (`aria-activedescendant`); 150 ms debounce; ignore stale
   responses. Search page: platform filter chips with counts, landscape grid.

## Phase 3: Installable app + mobile pass
1. `web/public/manifest.webmanifest` (name DramaUs, standalone, black theme, start_url `/`), PNG icons
   192/512 + maskable 512 + apple-touch-icon 180 (rendered from the existing red play logo), favicon set.
2. Minimal service worker (cache-first for built assets, network-only for `/api` and `/media`, offline page).
3. "Install app" item in the avatar menu + a dismissible banner on first mobile visit:
   - Chrome/Edge (HTTPS): native prompt via `beforeinstallprompt`.
   - iPhone/iPad: illustrated steps (Share → Add to Home Screen).
   - Android over http / TVs: steps to add a home-screen shortcut / browser bookmark, with a QR code of the
     server URL for opening it on a phone or TV quickly.
   - Hidden once running standalone.
4. **Mobile pass**: screenshot every page at 360 / 390 / 768 px (Home, Browse, Search, Series, player,
   Library, Downloads, Favourites, Account, Profiles, Settings, Users, User detail, Login) and fix overflow,
   tap-target sizes (≥ 44 px), sticky bars, and the nav (collapse the link row into a bottom tab bar on phones).

## Phase 4: HTTPS with Tailscale (dropped 2026-10-20: user chose to stay on LAN http)
1. **User:** install Tailscale on this PC and sign in; in the Tailscale admin console enable MagicDNS and
   HTTPS certificates; install Tailscale on phones/TVs that should use the app.
2. Claude: `tailscale serve --bg http://localhost:8096` → `https://<pc>.<tailnet>.ts.net`; mark session/device
   cookies `Secure` when the request came over HTTPS; show the HTTPS address in Settings and in the install
   dialog's QR code; verify Chrome's install prompt appears.

Each phase stops for confirmation before the next.

---

# Ticket: Videos not loading + infinite scroll (2026-10-20)

## Findings
- **iPhone/iPad (confirmed bug):** `PlayerShell.enterFullscreen()` calls `video.webkitEnterFullscreen()` before
  the video has a source. Safari throws `InvalidStateError` synchronously, which aborts `play()` before the
  stream is requested, so nothing loads.
- **Desktop: not reproduced.** Headless Chrome plays all 10 working platforms (DramaBox, NetShort, ReelShort,
  ShortMax, GoodShort, FlickReels, DramaBite, Vibeshort, Serial+, plus HLS ones through /api/hls), both on
  localhost and on http://192.168.1.111, with Chrome's normal autoplay policy. Container logs reset on each
  rebuild, so the failed attempts weren't captured. Storyreel's episode list is just slow (>4 s upstream).
- Grids use a "Load more" button (ShowGrid).

## Phase 1: Video fixes + diagnostics
1. Fullscreen never blocks playback: wrap every fullscreen/orientation call in try/catch. On iOS play inline
   (`playsInline`) and enter native fullscreen only once the video has metadata (from the same tap where
   possible, otherwise via the fullscreen button).
2. Loading watchdog: if an episode hasn't started after 15 s, show "Taking longer than usual" with Retry /
   Next; a stalled stream (`stalled`/`waiting` > 20 s) shows the same.
3. Client playback telemetry: `POST /api/client-log` (signed-in, rate-limited, size-capped) records
   {event, platform, bookId, episode, browser/OS, media error code/message, hls details}, written to the server
   log, so real-device failures show up in `docker logs`. Fired on stream-URL failure, media error, HLS fatal
   error, watchdog timeout, and play() rejection.
4. Re-test: all platforms in headless Chrome + Firefox if available, mobile emulation.

## Phase 2: Infinite scroll
1. ShowGrid: IntersectionObserver sentinel (rootMargin 800 px) loads the next page automatically; one request
   in flight; stops at `hasMore: false` with a quiet "You've reached the end"; on error shows Retry inline;
   keeps a visually hidden "Load more" button for keyboard/screen-reader users; `aria-live` announces
   "Loaded N more".
2. Applies everywhere ShowGrid is used (Browse, Search, Favourites, Account favourites).

Each phase stops for confirmation before the next.

---

# Ticket: DramaBox duplicated by DramaBuzz, DramaBox missing in search, row-wide hover (2026-10-21)

## Findings
- The "DramaBuzz / GoodBos (shared key)" source (type `dramabuzz`, enabled) calls the **same** upstream as the
  DramaBox platform (`dramabox.goodbos.online/api/dramabox/trending` and `/search`). Home shows two identical
  rows, Browse lists it as a platform, and search fans out to both. Shows are keyed by bookId alone, so each
  duplicate overwrites the other's `sourceId`: DramaBox titles end up labelled DramaBuzz.
- DramaBox upstream: `trending`, `latest`, `foryou` are three different lists (20 / 20 / 10) and none paginate
  (page 2 = page 1); `search` doesn't paginate either. Search results include `type: "actor"` entries without
  a bookId (correctly dropped). Every other `/api/dramabox/*` path tried is 404.
- Hover: `ShowRow`'s container has `group` (for its scroll arrows) and `ShowCard` uses unnamed `group-hover:`,
  so hovering anywhere in a row highlights every card in it.

## Phase 1 (single phase)
1. DramaBuzz becomes **key-only**: kept in config as the shared API key holder (Settings still edits it), but
   excluded from `listEnabledSources()` (Browse platform list, Home rows, search fan-out) and from activation;
   if it is the active source, switch to `dramabox`. Settings labels it "Shared GoodBos API key".
2. Data repair (idempotent on start): `UPDATE shows SET sourceId = 'dramabox' WHERE sourceId = 'dramabuzz'`;
   rows with NULL sourceId whose bookId matches DramaBox's numeric 41/42-prefixed pattern → `dramabox`.
3. DramaBox browse: merge `trending` + `latest` + `foryou` (deduped, ~40 titles), `hasMore: false` so the
   grid doesn't re-request identical pages; search: `hasMore: false`.
4. Hover: `ShowCard` → `group/card` + `group-hover/card:*`; `ShowRow` → `group/row` + `group-hover/row:*`;
   check other `group` users for the same leak.
5. Verify on a data copy: Home has one DramaBox row and no DramaBuzz row; `/api/browse/sources` has no
   DramaBuzz; searching a DramaBox title (e.g. "Love's Encore", "He Broke the Heart") returns it labelled
   DramaBox once; hover screenshot shows only the hovered card scaled.

---

# Ticket: Row "View all", platform logos, portrait cards, series page redesign, DramaBox search (2026-10-21)

## Findings
- DramaBox search is hard-capped upstream: always 12 entries (10–12 dramas + actors) for any query;
  `page`, `pageNo`, `pageNum`, `offset`, `size`, `pageSize`, `limit`, `index` are all ignored.
- Covers from every platform are portrait (≈3:4); the current 16:9 cards crop most of the image.
- Rows have no "View all"; row titles are plain text. No platform logos exist in the app.
- Reference series page (mobile): breadcrumb "Home / Title / EP 1", "Episode 1 · Title", "Episode 1 plot"
  with More, four round actions (Like + count, Save, Follow, Share), episode range "1-37" + "All episodes >",
  numbered square tiles in a 6-column grid with the current episode highlighted in pink.

## Phase 1: Cards, rows, logos
1. **Portrait cards**: ShowCard `aspect-[2/3]` (poster), cover `object-cover object-center`; episode-count badge
   and platform logo chip on the image; title + first tag below. Row items `w-[140px] sm:w-[170px]
   lg:w-[190px]`; grids `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7`. Continue
   Watching keeps a progress bar on the portrait card. Skeletons match.
2. **Platform logos**: download each platform's official icon (site favicon / app icon from its official
   website or app-store listing) once into `web/public/platforms/<id>.png` (64×64, committed); fallback is a
   coloured monogram badge generated from the name. One `<PlatformLogo id size>` component used in row
   titles, cards, Browse platform select, search results and the series page.
3. **Row headers**: `[logo] DramaBox` (platform rows), plain title for Trending / New & Popular / genre rows;
   right side **View all ›** linking to: platform row → `/browse?source=<id>`; Trending → `/browse?sort=latest`
   across the active platform; New & Popular → `/browse?sort=popular`; genre row → `/browse?tag=<tag>`;
   Continue Watching → `/library` (downloads) / hidden when there is nothing more.

## Phase 2: Series page redesign (matches the reference)
1. Layout: player (or cover with a big play button) on top; then breadcrumb `Home / <Title> / EP n`;
   heading `Episode n · <Title>`; "Episode n plot" (series intro, line-clamp-3 + More); desktop: player left
   (portrait-friendly max height), details + episodes right.
2. **Action row** (round 48 px buttons with labels):
   - **Like**: per-account like stored server-side (`likes` table); count = DramaUs accounts that liked it.
   - **Save**: add/remove My List (existing favourites); filled icon when saved.
   - **Follow**: server checks followed shows every 6 h (and when the show is opened); when the episode count
     grows, the follower gets an in-app notification "New episodes of <Title>".
   - **Share**: `navigator.share` when available, else copy link with a "Link copied" toast.
3. **Episodes**: range tabs `1-50`, `51-100`, … (one range when ≤ 50) in pink for the active range;
   "All episodes ›" opens a sheet listing every episode with name, progress and downloaded badge; numbered
   square tiles, 6 columns on phones (8–10 on desktop), current episode pink, watched ones dimmed with a
   tiny check, partially watched with a thin progress line; admins keep Download all in a "⋯" menu.

## Phase 3: More DramaBox search results
Query expansion for platforms with capped search (DramaBox first): besides the full query, also search each
word of ≥ 4 letters and the first two words (max 3 extra upstream calls, in parallel, cached 10 min), merge
and rank (phrase match first, then number of words matched), drop actor entries. Expected: ~10 → ~25–35
DramaBox results for multi-word queries; single-word queries stay at ≤ 12 (upstream limit).

Each phase stops for confirmation before the next.

---

# Ticket: 34 platforms, VIP accounts, mobile layout, free-tier rules + rewards (2026-10-21)

## Findings
- `api.dramabuzz.sbs/api/status` lists 44 platforms (34 active, 10 maintenance/coming) and serves an official
  logo for each (`api.dramabuzz.sbs/logos/<id>.png`). DramaUs supports 22; **missing active ones**: FreeReels,
  FunDrama, MicroDrama (drakula.goodbos.online/*-api.html), BiliTV, Stardusttv2, ShortsWave, DramaNova, CubeTV,
  HappyShort, PineDrama, RaptDrama, BonusTV (each documented at its goodbos `api.html`).
- Accounts: Admin, Laurie, Kathleen, Cheryl, all `tier = free`; `tiers.js` (pulled) marks every platform premium
  and isn't wired in. A direct live-DB write was blocked by the permission system, so VIP is set via a startup
  migration / the Users page instead.
- Mobile (screenshots at 375×812 / 812×375): nothing overflows, but the hero fills the whole first screen
  (huge title + three stacked tiles), the header search is squashed to "Searc", landscape phones get the
  desktop layout (giant hero title over the poster, hero = full height), and the Dramora purple logo clashes
  with leftover red accents.

## Free-tier model (from the user; numbers are defaults, all admin-editable in Settings → Free plan)
- **VIP platforms**: the main/popular sources are VIP-only: DramaBox, ReelShort, ShortMax, NetShort, DramaWave,
  GoodShort (admin toggles any platform Free/VIP). Other platforms are free.
- **Popular series are VIP** even on free platforms: a series is VIP when it is in the top 20 % by play count of
  its platform (or above an absolute play-count threshold), recomputed daily.
- **Welcome gift**: every new free account gets one random full VIP series unlocked permanently (plus one more
  every 7 days of activity).
- **Daily login reward** (once per calendar day, on first sign-in/visit): random pick of
  (a) +20 points, (b) unlock the next 5 locked episodes of a series you're watching, (c) unlock a random full
  series from your My List / recommendations; streak bonus +10 points on day 7.
- **Share reward**: sharing a series via the Share button (native share sheet completed, or link copied)
  gives +10 points, max 3 times a day; +25 more when someone else opens the shared link and signs in.
- **Points shop**: unlock a series (100 pts; 60 for series on your My List), unlock a VIP platform for 24 h
  (300 pts), unlock the next 5 episodes (40 pts).
- **VIP**: set by an admin (Users page: Free/VIP switch + optional expiry date); free users see "Ask your admin
  for VIP". No payments.
- Enforcement is server-side (stream URL, HLS proxy, downloads stay admin-only); the UI only reflects it.

## Phase 1: Mobile layout + consistent Dramora theme
1. Phones: compact hero (≤ 60 % of the viewport: poster backdrop, title text-3xl line-clamp-2, Play / More Info,
   quick tiles become a horizontal chip row); header search collapses to an icon on < sm (tab bar Search opens
   a full-screen search sheet); 2.5 cards visible per row.
2. Short screens (`max-height: 500px`, landscape phones/TVs): hero shrinks to a banner, nav single-line, player
   page uses the full height, tab bar hidden in landscape (side nav or top links instead).
3. Unify accents to the Dramora palette (theme tokens only; replace hard-coded rose/red classes).
4. Re-audit every page at 320/375/414 portrait, 667×375/812×375 landscape, 768, 1024; fix and re-check.

## Phase 2: Official logos + the 12 missing platforms
1. Download all 44 official logos from the API into `web/public/platforms/` (replacing the 8 found earlier
   and the monograms).
2. Read each missing platform's `api.html`, add adapters (reuse generic/api/core patterns), add them to the
   platform list (disabled by default, toggle in Settings), health-test all 34, report which work.

## Phase 3: Tiers + entitlements (server)
1. Accounts: `tier` ('free' | 'vip'), `vipUntil`; one-time migration: accounts that existed before tiers
   (Admin, Laurie, Kathleen, Cheryl) → VIP. Users page: Free/VIP switch + expiry.
2. `plan` settings (VIP platforms, popularity rule, rewards, prices) with the defaults above.
3. `unlocks(accountId, kind 'series'|'episodes'|'platform', ref, fromEp, toEp, expiresAt, reason)` and an
   `entitlements.canWatch(account, show, episodeIndex)` → `{ ok, reason, unlock options }`; enforced in the
   stream/HLS endpoints; browse/search/home responses carry `access: 'free'|'vip'|'unlocked'` per show.

## Phase 4: Points, rewards, sharing (server)
Points ledger, daily reward claim + streak, welcome gift, share tracking (`/s/<code>` short links that credit
the sharer when opened by another signed-in account), shop purchases, notifications for rewards.

### Phase 3 review (2026-10-21) and what was fixed
- `canWatch` treated "VIP account" and "locked" as the same `vip` value, so **admins and VIP accounts got 403
  on every VIP stream** (this was live in the container). Access is now `free` / `vip` (locked) / `unlocked`.
- `toAccount` dropped `vipUntil`, so expiry never applied. Fixed.
- `tiers.js` hard-coded 22 platforms as premium and used `require` in ESM; `plan.vipPlatforms` was never read.
  Removed; the plan (6 VIP platforms by default) drives everything.
- Popularity was an absolute 50 000-play cut-off (most of VibeShort/GoodShort). Now top `popularShare` (20 %) per
  platform from the shows cache, recomputed daily, platforms with < 10 ranked series exempt; absolute rule off by default.
- Series/platform unlocks were checked after the VIP short-circuit, so they never applied; platform unlocks
  were never checked. Fixed.
- Stream gate let uncached shows through, and the 403 lost its unlock options (`httpError` took 2 args).
- HLS gate guessed the platform from the hostname (`goodbos` → dramabox). Replaced by a signed per-account
  stream token (`&t=`) that `/api/hls` requires and copies onto rewritten child URLs.
- VIP migration matched four usernames on every start (it would re-promote a demoted user). It now runs once,
  when the `accounts.vipUntil` column is first added.
- Admins can edit the plan: `PUT /api/settings { plan: {...partial} }`, validated.

### Phase 4 API (implemented)
- `GET /api/rewards` → `{ vip, balance, streak, daily: { claimed, reward }, shares: { today, max }, gifts, unlocks[], history[], rules }`
  (also grants any due welcome/activity gift).
- `POST /api/rewards/daily` → `{ reward: { kind: points|episodes|series, ... }, streak, bonus, balance }`; 409 `already_claimed`.
  Episodes = next 5 locked after the last watched episode of a series being watched; series = random locked series
  from My List, else any; no candidate (or VIP) → points. Day-7 streak bonus +10.
- Welcome gift: one random locked full series on first sign-in/visit, one more every 7 claimed days. Free accounts only.
- `POST /api/rewards/share { bookId, source? }` → `{ code, path: '/s/<code>' }` (one code per account+series);
  `POST /api/rewards/share/complete { code }` → +10 pts, max 3 a day.
- `GET /s/<code>` (public) → redirect to the series. A signed-in visitor (or one who signs in later, via the
  `dbx_share` cookie) credits the sharer +25 once per visitor; never for your own link.
- `POST /api/rewards/shop { kind: series|episodes|platform, bookId?, source?, fromEp? }` → `{ cost, unlock, balance }`;
  400 `not_enough_points` (with balance/cost), not locked, or not a VIP platform. Atomic.
- Locked stream: 403 `{ error: 'vip_required', reason: platform|popular, bookId, source, episode, options[] }`.
- Notifications for daily rewards, gifts and shares that pay off.

## Phase 5: Free experience (web)
VIP badges/locks on cards and episode tiles, locked-episode screen in the player with unlock options
(points / reward / ask admin), a Rewards page (balance, daily claim, streak, history, shop), points in the
avatar menu, admin Settings → Free plan editor, Users page tier controls.

### Phase 5 spec
Server API is in "Phase 4 API" above. Web only; Dramora theme tokens (no hard-coded rose/red); works at 320 px.
1. **api.ts**: types `Plan`, `RewardsSummary`, `DailyResult`, `ShareLink`, `ShopResult`; `Config.plan`; `api.getRewards`,
   `claimDaily`, `createShare`, `completeShare`, `shopPurchase`, and `updateUser` accepting `tier` / `vipUntil`.
   `request()` throws an `ApiError` (extends Error) carrying `status` and the parsed body, so callers can read
   `vip_required` options. Helper `isVipAccount(account)` in `lib/` (admin, or tier vip and vipUntil null/future).
2. **Follow** button on the series page is hidden for VIP/admin accounts (free accounts only).
3. **Cards** (`ShowCard`): `access === 'vip'` shows a small lock + "VIP" badge; free accounts see "Unlocked" on
   `unlocked` shows. Nothing extra for VIP accounts.
4. **Series page**: VIP badge in the header for locked series; locked episode tiles are dimmed with a lock icon.
   Clicking a locked tile (or a stream reply 403 `vip_required`) opens the **Locked dialog** instead of playing.
5. **Locked dialog**: why it's locked ("<Platform> is a VIP platform" / "One of the most popular series on
   <Platform>"), points balance, one button per option with its cost ("Unlock episodes 6–10 · 40 pts",
   "Unlock the whole series · 100 pts" (shows the My List price when lower), "Unlock <Platform> for 24 h · 300 pts").
   An option the balance can't cover is disabled with "N more points". Buying → toast, reload episodes, play.
   Links: "Earn points" → /rewards; footer "Want everything? Ask your admin for VIP."
6. **Rewards page** `/rewards`: balance; streak (N of 7 dots); daily reward card (Claim → shows what was won,
   linking to the unlocked series); "Share to earn" (today x/3, +10 per share, +25 when a friend opens it);
   active unlocks (link to series, expiry for platform unlocks); recent history with readable reasons; prices.
   VIP accounts see "You're VIP: everything is unlocked" and no claim/shop prompts.
7. **Daily prompt**: once per session for a signed-in free account whose daily reward isn't claimed, a small
   bottom sheet "Your daily reward is ready" with Claim / Later.
8. **Share** button: uses `createShare` → `${location.origin}${path}`; after the share sheet completes or the
   link is copied, `completeShare(code)` and toast "+10 points" when points > 0.
9. **Avatar menu**: "Rewards · N pts" entry (free accounts) / "Rewards" (VIP).
10. **Settings → Free plan** (admin): VIP platforms checklist, popular share %, absolute play threshold,
    four prices, share points / max a day / join bonus, streak days / bonus, episodes per unlock, platform unlock
    hours, gift every N days, daily reward weights. Saves `PUT /api/settings { plan }`.
11. **Users**: tier badge on rows (VIP / Free / "VIP until 12 Nov" / "VIP expired"); user detail page gets a
    Free/VIP switch plus an optional expiry date (end of that day, local) with "Never expires".
**Verify:** `npx tsc --noEmit` and `npm run build` clean; rebuild container; browser check as a free test account
and a VIP account at 375 px and desktop.

Each phase stops for confirmation before the next.

# Ticket: Drop tiers & rewards, request-access sign-in, ReelShort-style home (2026-10-22)

## Decisions
- Only two roles: **Admin** and **User**. Free/VIP tiers, entitlements (locks/unlocks), points, daily rewards,
  sharing-for-points and the shop are removed completely. Every signed-in account watches everything.
- Sign-in page gets **Request access**. The visitor picks a username and password and can add a note. This creates
  a *pending* account that can't sign in. Every admin gets a notification and approves (activates) or rejects
  (deletes) it.
- Home is redesigned to match the ReelShort reference screenshots: a hero slider and new rows/cards.
- The uncommitted red palette in `index.css` stays, because it matches the reference. The uncommitted nav "Rewards"
  button and `accent` button variant are removed. The "Fandom"/"Brand" placeholder links (`to: '#'`) are replaced
  by real links.

## Phase 1: Server: remove tiers/rewards, add access requests, featured slider data
1. Delete `rewards.js`, `routes/rewards.js`, and the stream-token code that stays: move `streamToken` /
   `checkStreamToken` out of `entitlements.js` into a new `streamTokens.js` (hls.js still needs them), then delete
   `entitlements.js`. Remove every `entitlements.*` / `rewards.*` call. Remove `annotate`/`access` from the
   browse, home and stream responses and the `lockFor` 403 `vip_required` in the stream route. Remove the share cookie
   handling in the login route and `grantDueGifts`.
2. `config.js`: remove `plan` (its defaults, merge and settings patch). A stored `plan` key is ignored and dropped
   on the next save.
3. `db.js`: drop the tables `unlocks`, `points_ledger`, `daily_rewards`, `share_links`, `share_opens`
   (`DROP TABLE IF EXISTS` on start). Remove the tier/vipUntil migration and stop reading/writing those columns.
   SQLite keeps the columns, unused. `auth.toAccount` stops returning `tier`/`vipUntil`. `accounts.js` loses
   `setTier`/`setVipUntil`. The admin PATCH stops accepting them.
4. Access requests: add the columns `accounts.pending INTEGER NOT NULL DEFAULT 0` and `accounts.requestNote TEXT`.
   - `POST /api/auth/request-access { username, password, note? }`: public. It is rate limited by IP (3 per hour),
     validates with `parseUsername`/new-password rules, and gives a 409 if the username is taken. It creates the account
     with `role=user, pending=1, disabled=1, mustChangePassword=0` and notifies every enabled admin (kind
     `access_request`, link `/admin/users/:id`). The reply is `{ ok: true }`.
   - Login of a pending account returns 403 with "Your access request is waiting for an admin to approve it". The
     password is checked first, so the message only reaches the person who made the request.
   - `POST /api/admin/users/:id/approve`: sets pending=0, disabled=0 and notifies the user (seen on first sign-in).
     Reject = the existing `DELETE /api/admin/users/:id`.
   - The admin users list includes `pending` and `requestNote`. `/api/status` adds `pendingRequests` for admins.
5. `/api/home` adds `featured`: the 5 shows with the most views among all platforms' latest lists (deduped,
   cover required, introduction preferred). `hero` stays for compatibility, equal to `featured[0]`. Rows gain an optional
   `badge` per item: "Hot" for the top 10 by play count, "New" for the 2 newest of each platform's latest list.
**Verify:** server starts on a copy of the existing DB. `grep -ri "vip\|reward\|entitle\|tier" server/src` is clean.
Use curl for: request-access → pending login 403 → approve → login OK; `/api/home` has 5 `featured`.

## Phase 2: Web: remove the tier/rewards UI, request-access flow
1. Delete `Rewards.tsx`, `DailyRewardPrompt`, `LockedDialog`, `FreePlanSection`, `TierBadge`, `TierControls`,
   `lib/rewards.ts`, `lib/access.ts` and their routes/imports (App, Nav avatar menu, ShowCard locks, Show page
   locks/follow gating, Settings "Free plan", Users tier badges, user detail tier controls). Remove the matching types and
   calls in `api.ts`. "Follow" on the series page shows for everyone.
2. Login page: a secondary **Request access** button under Sign in. It opens a dialog (existing `Modal`) with
   username, password, confirm password and an optional note ("Who are you?"). On success it shows "Request sent. You can
   sign in once an admin approves it." and closes. A 403 pending error on sign-in shows as a calm info message, not red.
3. Admin: the Users page gets a **Pending requests** section at the top (username, note, requested date,
   Approve / Reject with confirm). The user detail page shows the same actions for a pending user. The Nav admin menu
   "Users" entry shows a count badge when `pendingRequests > 0`.
**Verify:** `npx tsc --noEmit` and `npm run build` are clean. In the browser: request → admin notification → approve →
sign in.

## Phase 3: Web: ReelShort-style home
1. **Header** (Nav): logo left, then Home / Categories (`/browse`) / My List (`/favourites`) / Downloads.
   Right side: search icon, history (`/library`), notifications, avatar. The header is transparent over the hero
   and turns solid on scroll. The active link uses the accent colour. The mobile bottom tabs stay.
2. **Hero slider** (`Hero.tsx` rewritten, uses `featured`): a full-bleed backdrop (cover, object-cover, left
   and bottom gradients). On the left: big title (2 lines max), a tag pill row ("Hot" in accent, then the first tag
   in grey), a 2-line synopsis and a large white rounded-full **Play** button. Bottom right: 5 thumbnail posters,
   with the active one outlined in white, and a chevron for next. Clicking a thumbnail selects it. It auto-advances every 6 s and pauses
   on hover/focus and with reduced motion. Crossfade between slides. Keyboard: the thumbnails are buttons. On mobile the
   thumbnails become dots under the Play button and you swipe to change slides.
3. **Rows** (`ShowRow`): bold title (text-2xl) with "View all ›" right-aligned in muted text. Wider cards
   (~260 px desktop, ~42vw phone) with the 3:4 poster at rounded-xl. A round chevron button sits on the right edge
   (always visible on desktop when it can scroll).
4. **Card** (`ShowCard`): poster with a badge pill top-left (Hot/New/Trending, accent or red) and "▶ 1.2M" play
   count bottom-right on a dark gradient. Below the poster: the title (1 line, 2 on hover), then a muted meta line
   "Tag | Series | Tag2". **Hover (desktop, pointer:fine):** the card lifts into a panel (scale ~1.05, rounded-2xl,
   bg panel-2, ring) that adds the 2-line synopsis and a row with a white **Play** pill, a **bookmark** (adds to/removes
   from My List, filled when listed) and a **share** button (native share or copy the link + toast). The expanded panel
   overlays the next row (absolute, z-index) and doesn't reflow the row. Touch devices skip the hover panel and tap
   opens the series. The platform logo moves to a tiny corner mark.
5. The Currently Watching row keeps its progress bar on the new card.
**Verify:** `tsc` + `build`. Browser check at 1440 px, 1024 px and 375 px against both screenshots. Check keyboard focus on the
slider and cards. Rebuild the Docker container.

Each phase stops for confirmation before the next.

# Ticket: Guest browsing, sign-in prompt on Play, back to the purple palette (2026-10-22)

## Decisions
- Anyone who can reach the site can browse: Home, Categories (Browse), Search and series pages. Watching and
  anything personal still needs an account.
- For a guest, every Play action (hero Play, the card hover Play, series page Play and episode tiles) and every personal action
  (My List bookmark, Follow, Like) opens a **Sign in to watch** popup. It offers **Sign in**, which goes to
  `/login?next=<current page>`, and **Request access**, which opens the existing request dialog in place.
- Colours go back to the purple/blue Dramora palette. The red ReelShort palette from the last ticket is reverted, but the
  layout stays.
- The Admin password was reset to the one the user asked for (done 2026-10-22, outside the phases).

## Phase 1: Server: public read-only browsing
1. In `index.js`, add a guest-readable set of GET routes: `/api/home`, `/api/browse/latest`,
   `/api/browse/categories`, `/api/browse/sources`, `/api/search`, `/api/search/suggest`, `/api/shows/:bookId`
   (the show details only, not `/stream`, `/social` or anything below them). For these, attach the account when there is a
   session and never send a 401. Other routes are unchanged (streams, HLS, media, watch, progress, favourites, account,
   admin).
2. A guest's `/api/home` doesn't get `errors` (upstream error text is for signed-in users).
3. `/api/status` for a guest still says `authenticated:false`. Add `guestBrowsing: true` so the web knows.
**Verify:** curl without a cookie: the public routes return 200. Stream, watch, favourites and admin routes return 401.
Signed-in behaviour is unchanged.

## Phase 2: Web: guest mode, sign-in popup, purple palette
1. `index.css`: restore the palette from before the last ticket (ink #0A0A0F, panel #16161F, panel-2 #1E1E2A,
   line #2A2A38, accent #7C3AED, accent-hi #C026D3, accent-soft #A78BFA, accent-text #E879F9). Replace any hard-coded
   red classes added since with tokens.
2. `App.tsx`: when signed out, routes `/`, `/browse`, `/search` and `/show/:bookId` render inside the normal layout.
   Every other route redirects to `/login?next=…`, as today.
3. Nav for guests: Home / Categories links and search. On the right, a **Sign in** button replaces the
   history, notifications and avatar. The mobile bottom tabs show only Home / Browse / Search.
4. Add a `SignInPrompt` modal and a `useRequireAccount()` helper. It returns a guard that runs the action when signed in,
   or opens the popup when not. The popup has a title "Sign in to watch", a line naming the series, a **Sign in**
   button and a **Request access** button that opens `RequestAccessDialog`. Use it for: hero Play, the card hover Play and
   bookmark, the series page Play, episode tiles, Follow, Like and Save. Share stays open to everyone.
5. Make no per-account calls for guests: Continue Watching, the favourites store, notifications, the social and watch
   endpoints on the series page, and the "add to library"/download admin bits. Nothing may hit `handleUnauthorized()`
   while browsing as a guest, because that would bounce the guest to the login page.
6. Login page: keep `next`, so signing in from the popup returns to the same series.
**Verify:** `tsc` + `build`. Browser as a guest at 1440 and 375 px: home, browse, search and series pages load. Play,
an episode tile and the bookmark each open the popup. Sign in returns to the series and plays. Request access works
from the popup. No 401 redirects in the network log. Rebuild the container.

Each phase stops for confirmation before the next.

# Ticket: "Install app" in the user menu, hidden only when installed (2026-10-22)

## Findings
- The Skyworth Google TV stick browser is built on WebView. Its user agent contains `; wv)`, so `isInstalled()` thought
  it was the Dramora app and hid the menu item.
- The Dramora APK (`app.dramora`) uses the stock WebView user agent. There's no `DramoraAndroid` marker, so the page
  can't tell the app apart from a WebView-based browser.
- First attempt (per-account `hasMobileApp`, localStorage "downloaded" flag) dropped: the user wants the item hidden
  only when the app is installed on this device.

## Phase 1 (single phase)
1. `install.tsx` `isInstalled()`: installed means standalone display mode, iOS standalone, or the `DramoraAndroid`
   user agent marker. A bare `; wv)` no longer counts.
2. Avatar menu (`Nav.tsx`) shows **Install app** whenever not installed:
   - Any Android user agent (phones, tablets, Android/Google TV sticks): a direct link to `/dramora.apk`.
   - iOS and desktop: opens the install dialog.
   - Non-Android TVs (Tizen, webOS, ...): hidden.
3. Follow-up outside this repo: the APK should append ` DramoraAndroid` to its WebView user agent so the item hides
   inside the app.
**Verify:** `tsc` + `build`, rebuild the container.

# Ticket: Cards that don't overlap, and remote (D-pad) navigation on TV (2026-10-22)

## Findings
- `ShowCard` hover/focus opens a floating panel (`absolute`, `scale-105`, taller than the card). It covers the
  neighbouring cards and the next row. `ShowRow` makes room with `pb-40 -mb-40`, so the rows still overlap.
- The purple border is the global `:focus-visible` outline (`3px solid accent-hi`). The TV browser shows it on
  every focused button.
- The Skyworth stick UA says `Google TV` with a space, which `TV_PATTERN` misses, so it's treated as an Android phone.
- The APK is a plain WebView. Its source isn't in this repo. The remote's D-pad reaches the page as arrow key
  events, so remote navigation has to come from the web app.
- Nothing moves focus between cards with arrow keys today. Only Profiles, SearchBox and the player handle arrows.

## Phase 1: Cards that stay in their slot, and a calmer focus style
1. `ShowCard`: drop the floating panel. On hover (`pointer-fine`) or keyboard focus, the poster lifts slightly
   (`scale-[1.04]`) with a white ring. A gradient at the poster's bottom shows Play, My List and Share. Nothing
   leaves the card's box, so neighbours and the next row stay uncovered. The description stays on the show page.
2. `ShowRow`: remove `pb-40 -mb-40`. Keep a few pixels of padding so the lifted card isn't clipped.
3. `index.css`: the global `:focus-visible` becomes a 2px white ring (`outline: 2px solid rgb(255 255 255 / .9)`,
   offset 2px). No purple outlines.
**Verify:** `tsc` + `build`. Playwright screenshots on desktop: hover a card mid-row and in the first row, check
that no neighbour or lower row is covered. Tab through a row.

## Phase 2: Remote navigation on TV
1. `install.tsx`: `TV_PATTERN` also matches `Google TV` and `Android TV` with a space.
2. New `lib/spatialNav.ts`, started from `main.tsx` when the platform is `tv` or the UA has `DramoraAndroid`:
   - Arrow keys move focus to the nearest visible focusable element in that direction (by geometry), then
     `scrollIntoView({ block: 'nearest', inline: 'nearest' })` so rows and the page scroll with focus.
   - Skipped when the event was already handled (`defaultPrevented`: player, Profiles, search suggestions) or focus
     is in a text input, select or textarea.
   - Enter clicks, as browsers already do. On load, focus goes to the hero's Play button.
3. On TV, each card is one focus stop. Its action buttons and the row scroll arrows get `tabIndex={-1}`; Enter opens
   the show page, which has Play, My List and Share.
4. The `html` element gets a `tv` class on TV so styles can enlarge focus rings a little for viewing distance.
**Verify:** Playwright with the Skyworth UA and a 1920x1080 viewport. Arrow through the nav, hero, and across and
down rows. Enter opens a show, Enter on Play starts the player, and the player's own arrow keys still seek.
Rebuild the container.

## Note
If the APK swallows D-pad keys before the WebView sees them, that needs a change in the app's source (not here).
