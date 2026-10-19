# Dramabox Server — Self-Hosted Chinese Drama Streaming & Download App

## Overview

**Dramabox Server** is a self-hosted web application inspired by Netflix (for browsing and playback) and tools like Radarr + Jellyfin (for automated downloading and local media management).

It connects to the unofficial [Dramabox API client](https://github.com/zhadevv/dramabox) (`@zhadev/dramabox`) to discover Chinese short dramas, then downloads selected episodes or full series to a user-defined local folder. Once downloaded, the content is available for streaming over the local network to any device.

The app runs entirely on your own hardware (like Jellyfin or Radarr) and is accessible to anyone on your home/LAN network.

**Disclaimer**: This uses an unofficial API. It is not affiliated with Dramabox. Use responsibly, respect the service’s Terms of Service, and only for personal/legal use. Rate limiting and caching are required. Direct API access is frequently blocked from South African IPs; the app is designed to route all Dramabox requests through an optional proxy.

---

## Core Goals

1. **Browse & Search** — Netflix-style interface to discover dramas.
2. **Download to Local Storage** — User selects a show (or individual episodes) and adds it to a download queue. Files are saved to a configurable local folder.
3. **Local Playback** — Serve downloaded media to devices on the network (browser or dedicated players).
4. **Self-Hosted & Network Accessible** — Runs on a local machine (PC, NAS, mini-PC, Raspberry Pi, etc.) and is reachable by other devices on the same network (phones, TVs, tablets).
5. **Simple Setup** — During first-run setup, the user chooses the download location, optional proxy, and basic configuration.
6. **Proxy Support** — Optional HTTP/SOCKS proxy for all Dramabox API and download requests (required for many South African users).

---

## Key Features

### Discovery & Browsing
- Homepage with sections: Latest, Trending, For You, Recommended, Coming Soon, Categories, Indonesian Dubbed, VIP (if available).
- Search with suggestions and advanced filters.
- Drama detail page: poster, synopsis, tags, episode list, related dramas.
- Multi-language support (English, Indonesian, Chinese, etc.) matching the API.

### Download Management
- “Add to Downloads” button on drama or episode level.
- Download queue with progress tracking.
- Configurable download location (set during setup or in Settings).
- Options: download single episode, selected episodes, or full series.
- Automatic folder structure: `DownloadLocation/Show Name (Year)/Season or Show Name - S01E01 - Episode Title.mp4`
- Resume support and retry logic.
- Status indicators: Queued, Downloading, Completed, Failed.

### Playback
- Built-in HTML5 video player for local files.
- Direct play of downloaded MP4s.
- Optional integration with external players or media servers (Jellyfin/Plex library folder pointing at the same download location).

### Network & Access
- Binds to `0.0.0.0` so it is accessible from any device on the LAN (e.g. `http://192.168.1.50:8096`).
- Optional basic authentication or PIN for multi-user households.
- Responsive web UI that works on desktop, mobile, and TV browsers.

### Settings & Setup
- First-run wizard:
  1. Choose download root folder.
  2. Set language preference.
  3. Optional proxy URL (HTTP or SOCKS5) — strongly recommended if the server is in South Africa or another restricted region.
  4. Optional rate-limit / delay settings.
  5. Optional admin password.
- Persistent configuration stored locally (JSON or SQLite).
- Library scan of the download folder to show already-downloaded content.

---

## Recommended Architecture

```
┌─────────────────────────────────────────┐
│           Web UI (Browser)              │
│     React / Vue / Svelte + Tailwind     │
└─────────────────┬───────────────────────┘
                  │ HTTP / WebSocket
┌─────────────────▼───────────────────────┐
│         Backend API Server              │
│   Node.js (Express / Fastify) or        │
│   Python (FastAPI)                      │
│                                         │
│  - @zhadev/dramabox client (with optional proxy) │
│  - Download manager (queue + progress)  │
│  - File system watcher                  │
│  - Media library scanner                │
│  - Static file serving for videos       │
│  - Proxy routing for API + downloads    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Local File System                  │
│   /media/dramabox/Show Name/...         │
└─────────────────────────────────────────┘
```

### Suggested Tech Stack

| Layer          | Recommended Options                          | Notes |
|----------------|----------------------------------------------|-------|
| Frontend       | React + Vite or Next.js, Tailwind CSS, shadcn/ui | Netflix-style cards, hero banners |
| Backend        | Node.js + Fastify / Express                  | Easy integration with `@zhadev/dramabox` |
| Database       | SQLite (better-sqlite3 or Prisma)            | Shows, episodes, download history, settings |
| Downloads      | `node-fetch` / `undici` or `axios` + streams | Stream MP4s directly to disk |
| Process Mgmt   | PM2 or Docker                                | Keep running in background |
| Optional       | Docker Compose                               | Easy deployment like Jellyfin |

### Alternative: Full-stack with one language
- **Next.js** (API routes + frontend) for simpler deployment.
- **Python FastAPI** + React frontend if you prefer Python for the download logic.

---

## Setup Process (First Run)

1. User starts the app (or runs Docker container).
2. App detects no configuration and shows the **Setup Wizard**.
3. Wizard steps:
   - **Download Location**: Folder picker (or manual path entry). Validates write permissions.
   - **Proxy** (optional but recommended for SA): HTTP or SOCKS5 proxy URL. Example: `http://user:pass@host:port` or `socks5://host:port`.
   - **Language**: Default API language (`en`, `in`, etc.).
   - **Network**: Show the local URL that other devices should use (e.g. `http://192.168.x.x:PORT`).
   - **Optional**: Admin password, download concurrency limit, request delay.
4. Configuration is saved.
5. User is taken to the main dashboard.
6. They can immediately search for a show, click “Add to Downloads”, and files begin saving to the chosen folder.

---

## Download Flow

1. User finds a drama via search or browse.
2. Clicks **Add to Downloads** (full series) or selects specific episodes.
3. Backend:
   - Calls Dramabox API methods (`getDramaDetail`, `getChapters`, `getStreamUrl` or `batchDownload`) via the configured proxy.
   - Adds items to a persistent download queue (SQLite).
   - Starts downloading MP4 streams (also via proxy when configured) to the configured folder with proper naming.
4. Progress is reported via WebSocket or polling to the UI.
5. Completed files appear in the “Library” section and can be played immediately.
6. Optional: Trigger a library refresh if integrated with Jellyfin/Plex.

---

## Folder Structure Example

```
/downloads/dramabox/
├── Istriku Tiga Takdirku Gila/
│   ├── Istriku Tiga Takdirku Gila - E01 - Episode Title.mp4
│   ├── Istriku Tiga Takdirku Gila - E02 - Episode Title.mp4
│   └── ...
├── Another Show/
│   └── ...
└── .dramabox-server/
    ├── config.json
    └── library.db
```

---

## Network Accessibility

- Server listens on `0.0.0.0:8096` (or configurable port).
- Other devices on the same network access it via the host’s local IP.
- Optional mDNS/Bonjour advertising so it appears as “Dramabox Server” on the network.
- Firewall note: User may need to allow the port on their router/firewall for full LAN access.

---

## Development Phases

### Phase 1 — MVP
- Setup wizard (download location + optional proxy).
- Search + drama detail pages.
- Add full series / single episode to queue.
- Basic download to disk with progress.
- Simple video player for local files.
- LAN access.

### Phase 2 — Polish
- Netflix-style homepage and card layouts.
- Download queue management (pause, retry, remove).
- Library view of already downloaded content.
- Better error handling and rate-limit awareness.

### Phase 3 — Advanced
- Multi-user support.
- Watch progress tracking.
- Integration hooks for Jellyfin/Plex.
- Docker image + docker-compose.
- Automatic updates / health checks.

---

## Proxy Support (South Africa & Restricted Regions)

Direct requests from South African IPs to the Dramabox backend are frequently blocked. The `@zhadev/dramabox` client supports proxies natively.

### Configuration Example
```javascript
import DramaboxClient from '@zhadev/dramabox';

const client = new DramaboxClient({
  proxy: process.env.DRAMABOX_PROXY || 'http://user:pass@proxy-host:port',
  // or socks5://user:pass@proxy-host:port
  requestDelay: 2000,
  language: 'en',
  timeout: 45000,
  maxRetries: 3,
});
```

### Recommendations
- Use a residential or high-quality datacenter proxy outside South Africa (Europe, US, or Asia preferred).
- Apply the same proxy to both API calls and the actual MP4 downloads.
- Store the proxy URL securely in the app’s config (never hard-code credentials in the frontend).
- Test the proxy connection during the setup wizard.
- Fall back to direct connections only if the proxy fails and the user is in an unrestricted region.

### Proxy Sources
- Residential proxy services (Bright Data, IPRoyal, etc.)
- Personal VPS outside SA used as a forward proxy
- SOCKS5/HTTP proxies from reputable providers

---

## Important Considerations

- **Rate Limiting**: The Dramabox API client supports delays and caching. Implement generous delays (1–2+ seconds between requests) to avoid blocks.
- **Legal / ToS**: Unofficial API. Personal use only. Do not redistribute content.
- **Storage**: Chinese short dramas can have many episodes. Plan disk space accordingly.
- **Reliability**: Some drama IDs may fail (known issue noted in the API client). Implement retries and clear error messages.
- **Authentication**: The API client handles token generation internally; no user login to Dramabox is required.
- **Security**: If exposing beyond pure LAN, add authentication. By default it should stay local-network only.

---

## Getting Started (Development)

```bash
# Clone / create project
mkdir dramabox-server && cd dramabox-server

# Backend
npm init -y
npm install @zhadev/dramabox fastify better-sqlite3

# Frontend (example with Vite + React)
npm create vite@latest frontend -- --template react
```

Use the official `@zhadev/dramabox` package for all API interactions.

---

## Summary

Dramabox Server turns the unofficial Dramabox API into a practical, self-hosted media solution: browse Chinese dramas like Netflix, queue them for download like Radarr, and stream the local files over your network like Jellyfin. The critical first-run steps are choosing the download location and (for South African users) configuring a proxy so API access works reliably.

This design keeps the system simple, local, and network-accessible while leveraging the existing Dramabox API client.
