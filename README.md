# Dramabox Server

A self-hosted server and web UI for browsing, downloading and watching short dramas from the Dramabox catalogue. It runs on your own machine or NAS, saves episodes as ordinary MP4 files, and serves them to any browser on your network. The files also work with Jellyfin and Plex.

> **Disclaimer.** This project is an unofficial client for a third-party service. It is not affiliated with, endorsed by, or supported by Dramabox. You are responsible for making sure your use complies with the terms of that service and the laws that apply to you, including copyright. Use it only for content you are entitled to download.

## Requirements

- Node.js 22 or newer (`node -v`), or Docker with Compose v2.
- A proxy outside the blocked region if the Dramabox API refuses your connection (see [Proxy](#proxy)).

## Install, build and start

The repository has two npm packages, `server/` and `web/`. Each keeps its own `package-lock.json`. npm workspaces are not used, because they do not work on exFAT drives and the lockfiles must stay per folder.

```sh
npm install        # root postinstall installs server/ and web/
npm run build      # builds web/dist
npm start          # serves the UI and API on http://localhost:8096
```

For development, `npm run dev` runs the server with `--watch` and the Vite dev server together.

### Mock mode

Mock mode serves recorded fixtures and a sample video instead of calling Dramabox. Use it to try the UI, the download queue and playback without network access:

```sh
npm run start:mock   # or: cd server && DRAMABOX_MOCK=1 npm start
```

## First-run wizard

On first start, the UI opens a setup wizard. It asks for:

1. **Download folder.** The folder is checked for write access. Episodes are saved as `<folder>/<Show>/<Show> - E01 - <Episode>.mp4`.
2. **Language** for the catalogue.
3. **Proxy** (optional). Use **Test connection** to check the egress IP and whether the API answers through it.
4. **Request delay** and **concurrency** for downloads, and the **quality** preference (default 720p).
5. **Admin password** (optional). If set, the whole server asks for it.

The wizard also shows the LAN URLs the server is reachable at.

## LAN access and firewall

The server listens on `0.0.0.0:8096` by default. Other devices reach it at `http://<this-machine-ip>:8096`.

On Windows, the first run may trigger a firewall prompt. If you skipped it, allow the port with an inbound rule (PowerShell, as administrator):

```powershell
New-NetFirewallRule -DisplayName "Dramabox Server" -Direction Inbound -Protocol TCP -LocalPort 8096 -Action Allow
```

Change the port with the `PORT` environment variable, and the bind address with `HOST`.

## Proxy

The Dramabox API is blocked for some regions, including South Africa. It then returns HTTP 403 "Access Denied". If you see that error, configure a proxy located outside the blocked region. The image CDN is reachable without one.

Accepted proxy URL formats:

- `http://host:port`
- `https://host:port`
- `http://user:pass@host:port`
- `socks5://host:port` and `socks5h://host:port` (optionally with `user:pass@`)

Set the proxy in the wizard or in Settings, or with the `DRAMABOX_PROXY` environment variable, which overrides the saved value. Passwords are masked as `***` in every API response.

Note: the `@zhadev/dramabox` 0.0.2 library ignores its own `proxy` option. The server therefore routes requests itself. It patches Node's `https` module so that requests to Dramabox hosts go through the proxy, and MP4 downloads use the same proxy.

## Docker

```sh
docker compose up -d
```

`docker-compose.yml` maps host port `8096` (override with `HOST_PORT`) and mounts two folders:

| Mount | Purpose | Default |
|---|---|---|
| `./data:/data` | config and library database | `./data` |
| `${MEDIA_DIR:-./media}:/media` | downloaded episodes | `./media` |

Environment passed through from the host: `DRAMABOX_PROXY`, `REQUEST_DELAY`, `DRAMABOX_LANG`, `TZ`.

The image runs as the `node` user (uid 1000). On a Linux host, make `./data` and the media folder writable by uid 1000.

**mDNS.** The server advertises itself as "Dramabox Server" on the LAN. Bridge networking does not forward multicast, so on a Linux host you can switch the service to `network_mode: host` (see the comment in `docker-compose.yml`). Docker Desktop does not support host networking. If multicast is unavailable, the server logs a line and carries on.

Health check: `GET /api/health` returns 200 when the database is healthy, and 503 otherwise. It does not need a password.

## Jellyfin and Plex

Both servers need a library that points at the **download folder** (the one you chose in the wizard), with one folder per show.

- **Jellyfin.** Add a Shows (or Mixed) library at the download folder. In Dramabox Settings, Media servers, Jellyfin, enter the server URL and an API key (Dashboard, API Keys). Test, then enable it. After downloads complete, Jellyfin is asked to refresh, 30 seconds after the last download finishes.
- **Plex.** Add a TV Shows library at the download folder. In Settings, Media servers, Plex, enter the URL and the `X-Plex-Token` (Plex's "Finding an authentication token" guide explains how to get it). Test lists the sections, so you can pick one, or leave the section empty to refresh all of them.

The sidecar files `show.json` and `poster.jpg` in each show folder help both servers match metadata.

## Profiles and PINs

The first profile, "Me", is created automatically and is an admin. Profiles let several people share one server, each with their own watch progress.

- Choose a profile at "Who's watching?". Profiles with a PIN ask for a 4 to 6 digit PIN. Wrong PINs are throttled to 5 attempts per minute.
- Admins can add, edit and delete profiles and change settings. Non-admins can browse, download and watch, and can edit their own name, colour and PIN. At least one admin always remains.
- If only one profile exists and it has no PIN, it is used automatically.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8096` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | Config and library database |
| `DEFAULT_DOWNLOAD_ROOT` | (per OS) | Download folder suggested by the wizard |
| `DRAMABOX_PROXY` | (none) | Proxy URL; overrides the saved setting |
| `REQUEST_DELAY` | `2000` | Milliseconds between Dramabox API requests |
| `DRAMABOX_LANG` | `en` | Catalogue language |
| `DRAMABOX_MOCK` | (off) | Set to `1` for offline fixtures |
| `TZ` | `UTC` | Time zone (Docker) |

## Data locations

- `DATA_DIR/config.json`: settings, including the password and proxy hashes.
- `DATA_DIR/library.db`: SQLite database with the library, download queue, profiles, progress and sessions.
- `<download folder>/<Show>/`: episodes, `show.json` and `poster.jpg`. Partially downloaded files end in `.part` and resume automatically.

Back up `DATA_DIR`. If the database is lost, a library scan restores the library from the downloaded files and their sidecars.

## Updating

- **From source:** `git pull`, then `npm install && npm run build`, then restart.
- **Docker, with a registry image:** `docker compose pull && docker compose up -d`.
- **Docker, built locally:** `git pull`, then `docker compose build && docker compose up -d`.
- **Automatic updates** are out of scope. If you want them, use Watchtower.

Your data in `./data` and your media folder are kept across updates.

## Known limitations

- **Drama detail endpoints are broken upstream.** The Dramabox detail calls return "Drama not found", even in the upstream library's own examples. The detail page is therefore built from show data seen in lists and search, plus the episode list.
- **1080p is VIP-only.** Downloads use the highest non-VIP quality at or below your preference, so the default is 720p.
- **The API is region-blocked without a proxy.** See [Proxy](#proxy).

## Repository layout

- `server/`: Node 22, Fastify 5, better-sqlite3, plain ESM JavaScript.
- `web/`: React, Vite and TypeScript.
- `Dockerfile`, `.dockerignore`, `docker-compose.yml`: container build and run.
