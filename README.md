# Dramora

Self-hosted short-drama server. Guests can browse the catalogue. Watching, downloading and personal lists need an account. New people **request access**; an admin approves them.

The server runs on your PC, a NAS or a VPS. Phones, browsers and the Android app all open the same address.

> **Disclaimer.** This project is not affiliated with Dramabox, ReelShort, or any other short-drama platform. You are responsible for complying with their terms and applicable laws.

---

## Access

### Guest
- Home, categories, search and series pages are open without signing in.
- **Play**, My List and other personal actions open a sign-in / request-access dialog.

### Request access
- A visitor asks for an account from the login screen.
- The account stays **pending** until an admin approves or rejects it from **Users**.
- Pending sign-in is refused with a clear message. A badge in the admin menu shows how many requests are waiting.

### Admin and user
- **Admin** can change settings, manage users, manage profiles and delete episodes.
- **User** can browse, download and watch after approval.

---

## Contents

1. [Quick start](#quick-start)
2. [Step-by-step setup on Windows](#step-by-step-setup-on-windows)
3. [Setup on macOS and Linux](#setup-on-macos-and-linux)
4. [Setup with Docker](#setup-with-docker)
5. [Open it from outside your home](#open-it-from-outside-your-home)
6. [Android app](#android-app)
7. [Using the app](#using-the-app)
8. [Proxy: why you may need one](#proxy-why-you-may-need-one)
9. [Configuration reference](#configuration-reference)
10. [Updating](#updating)
11. [Troubleshooting](#troubleshooting)
12. [Known limitations](#known-limitations)
13. [Development](#development)

---

## Quick start

If you already have Git and Node.js 22 or newer:

```sh
git clone https://github.com/NetherMined/LocalDrama.git
cd LocalDrama
npm install
npm run build
npm start
```

Open **http://localhost:8096** and follow the setup wizard. If you are in South Africa or another blocked region, you will need a proxy. See [Proxy](#proxy-why-you-may-need-one).

---

## Step-by-step setup on Windows

These steps assume Windows 10 or 11. Commands go into **PowerShell**: press <kbd>Win</kbd>, type `PowerShell`, and press Enter.

### Step 1: Install Git and Node.js

Install both with `winget`, which comes with Windows:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

**Close PowerShell and open a new window**, so it picks up the new programs. Then check the versions:

```powershell
git --version
node -v
npm -v
```

`node -v` must print **v22** or higher. If it shows an older version, run `winget upgrade OpenJS.NodeJS.LTS`, or install Node 22 or newer from [nodejs.org](https://nodejs.org).

### Step 2: Download the code

Choose where the app should live, for example your user folder:

```powershell
cd $HOME
git clone https://github.com/NetherMined/LocalDrama.git
cd LocalDrama
```

> **On an exFAT or FAT32 drive** (most USB sticks and external drives), Git may report *"detected dubious ownership"*. Run this once, using your own path:
> `git config --global --add safe.directory D:/LocalDrama`

### Step 3: Install the dependencies

```powershell
npm install
```

This installs the root tools, then runs `npm install` inside `server/` and `web/` automatically. It takes one to three minutes. Warnings like `npm warn deprecated` are normal; errors are not (see [Troubleshooting](#troubleshooting)).

### Step 4: Build the web interface

```powershell
npm run build
```

When it finishes, the last line reads `✓ built in …`.

### Step 5 (optional): Try it in mock mode first

Mock mode uses recorded sample data and a short test video instead of the real catalogue APIs. It's a good way to check that everything works before you set up a proxy.

```powershell
npm run start:mock
```

Open **http://localhost:8096**, complete the wizard (any download folder works), download an episode or two and play it. Then stop the server with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

Mock mode stores its settings in the same `data` folder as the real app. Before Step 7, delete that folder so the real setup starts fresh. Also delete the test episodes in the download folder you used; they're all the same 8-second sample clip.

```powershell
Remove-Item -Recurse -Force .\data
```

### Step 6: Get a proxy (only if you're in a blocked region)

The Dramabox API rejects connections from some countries, including **South Africa**, with `HTTP 403 Access Denied`. If that applies to you, get an **HTTP or SOCKS5 proxy located outside the blocked region** (Europe, the US or Asia). Options:

- a residential or datacenter proxy service,
- your own small VPS abroad running a proxy such as Squid, 3proxy or Dante,
- `ssh -D 1080 user@your-vps`, which gives you a SOCKS5 proxy at `socks5://127.0.0.1:1080`.

You'll get an address like `http://user:pass@host:port` or `socks5://host:port`. You enter it in the wizard in Step 8. More detail is in [Proxy](#proxy-why-you-may-need-one).

### Step 7: Start the server

```powershell
npm start
```

The server prints log lines in JSON. Among them you should see one similar to:

```
{"level":30,...,"msg":"Server listening at http://192.168.1.50:8096"}
```

Keep this window open while you use the app. To run it in the background or at login, see [Step 11](#step-11-optional-start-automatically-with-windows).

### Step 8: Complete the setup wizard

Open **http://localhost:8096**. The wizard runs once, on first start:

| Step | What to do |
|---|---|
| **1. Download location** | The folder where episodes are saved, such as `C:\Users\you\Videos\Dramora` (suggested by default). Click **Check**: the app creates the folder if needed and confirms it can write there. Pick a drive with plenty of space, because a full series can have 80 or more episodes. |
| **2. Language** | The catalogue language: English, Indonesian, Chinese, Korean, Japanese, Spanish, and others. |
| **3. Connection** | Paste your proxy URL, or leave it empty, and click **Test connection**. It shows your outgoing IP and country, and whether the Dramabox API answers. Green **"Dramabox API reachable"** means you're ready. If the country still shows ZA, the proxy isn't working. |
| **4. Advanced** | **Request delay**: the pause between API calls. Keep it at 2000 ms or more to avoid being blocked. **Concurrency**: how many episodes download at once. **Quality**: 720p is the best that's available without an upstream VIP account. |
| **5. Admin password** | Optional. If you set one, every device has to log in for admin actions. Recommended if other people can reach the server. |
| **6. Network** | Shows the addresses other devices can use, such as `http://192.168.1.111:8096`. Note one down. |

Click **Finish**, and you land on the home page.

### Step 9: Allow the app through Windows Firewall

If Windows showed a firewall prompt the first time you ran `npm start`, allow it for **private networks**. If you missed it, open **PowerShell as administrator** (right-click, *Run as administrator*) and run:

```powershell
New-NetFirewallRule -DisplayName "Dramora" -Direction Inbound -Protocol TCP -LocalPort 8096 -Action Allow -Profile Private
```

Your network needs to be set to *Private* in Windows settings: Settings → Network & internet → your connection → Network profile type.

For access from the internet, also allow the **Public** profile, or create the rule without `-Profile Private`.

### Step 10: Open it on your phone or TV

On any device connected to the **same Wi-Fi or network**, open a browser and go to the address from the wizard's Network step, for example `http://192.168.1.111:8096`.

To find the address again later, run `ipconfig` and look for the *IPv4 Address* of your Wi-Fi or Ethernet adapter, or open **Settings → Network** in the app.

**Tip:** give the PC a fixed IP address with a DHCP reservation in your router, so the address doesn't change.

### Step 11 (optional): Start automatically with Windows

To have the server start whenever you log in, create a scheduled task. In PowerShell, from the `LocalDrama` folder:

```powershell
$dir = (Get-Location).Path
$cmd = "Set-Location '$dir'; npm start *>> data\server.log"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Dramora" -Action $action -Trigger $trigger -Description "Dramora media server"
Start-ScheduledTask -TaskName "Dramora"
```

The server now runs hidden in the background.

- **Logs** are written to `data\server.log`.
- **Stop the server:** `Stop-ScheduledTask -TaskName "Dramora"`, or end the `node` process in Task Manager.
- **Remove the task:** `Unregister-ScheduledTask -TaskName "Dramora"`.

To set environment variables (such as `DRAMABOX_PROXY`) for the task, change the first line to, for example:
`$cmd = "Set-Location '$dir'; `$env:DRAMABOX_PROXY='socks5://host:1080'; npm start *>> data\server.log"`

---

## Setup on macOS and Linux

The steps match Windows. Only the installation commands differ.

**1. Install Git and Node.js 22 or newer**

- **macOS** (with [Homebrew](https://brew.sh)): `brew install git node@22`, then follow the `brew` hint to add it to your PATH.
- **Debian/Ubuntu/Raspberry Pi OS:**
  ```sh
  sudo apt-get install -y git curl build-essential python3
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Any distro:** [nvm](https://github.com/nvm-sh/nvm) works too: `nvm install 22`.

**2. Download, install, build and start**

```sh
git clone https://github.com/NetherMined/LocalDrama.git
cd LocalDrama
npm install
npm run build
npm start
```

Then complete the [setup wizard](#step-8-complete-the-setup-wizard) at `http://localhost:8096`. The suggested download folder is `~/dramora`.

**3. Firewall (Linux with ufw):** `sudo ufw allow 8096/tcp`

**4. Run as a service (Linux, systemd).** Create `/etc/systemd/system/dramora.service`, changing the user and paths to match your system:

```ini
[Unit]
Description=Dramora
After=network-online.target
Wants=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/LocalDrama
ExecStart=/usr/bin/node server/src/index.js
Restart=on-failure
# Environment=DRAMABOX_PROXY=socks5://127.0.0.1:1080
# Environment=PUBLIC_URL=http://192.168.1.111:8096

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now dramora
journalctl -u dramora -f        # follow the logs
```

On macOS, `pm2` is the simplest way to keep it running: `npm install -g pm2 && pm2 start server/src/index.js --name dramora && pm2 save`.

---

## Setup with Docker

Docker builds and runs everything in a container, so you don't need Node.js on the host. The container listens on port **8096**. Compose publishes that port on the machine (`HOST_PORT`, default 8096).

**1. Install Docker**

- **Windows or macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/).
- **Linux:** Docker Engine plus the Compose plugin.

**2. Get the code**

```sh
git clone https://github.com/NetherMined/LocalDrama.git
cd LocalDrama
```

**3. Create a `.env` file** next to `docker-compose.yml`. Start from the example:

```sh
cp .env.example .env
```

```dotenv
# Where downloaded episodes go on this machine (default ./media)
MEDIA_DIR=D:/Dramas

# Port on this machine. Leave 8096 unless that port is already taken.
HOST_PORT=8096

# Address phones, TVs and the Android app should open.
# Use the PC's LAN address, not localhost and not the Docker network IP.
PUBLIC_URL=http://192.168.1.111:8096

# Proxy for blocked regions. Leave unset if you don't need one.
# DRAMABOX_PROXY=socks5://user:pass@proxy-host:1080

TZ=Africa/Johannesburg
```

The `.env` file is git-ignored, so your proxy credentials stay local.

`PUBLIC_URL` is what the app shows other devices (including the install QR). If you leave it empty, Docker may show an address that only works inside the container. Set it to an address a phone on your Wi-Fi can actually open.

**4. Build and start**

```sh
docker compose up -d --build
```

**5. Open it** at `http://localhost:8096` on the same machine, or at `PUBLIC_URL` from another device. Complete the wizard. Inside the container, the download folder is **`/media`**, which is already suggested. Keep it, because `/media` is mapped to your `MEDIA_DIR`.

| Command | What it does |
|---|---|
| `docker compose ps` | Shows status. `healthy` means OK. |
| `docker compose logs -f` | Follows the logs. |
| `docker compose up -d --build` | Rebuilds and restarts after `git pull`. |
| `docker compose down` | Stops the container. Your data and media are kept. |
| `docker compose restart` | Restarts without rebuilding. |

Notes:

- **Where data lives:** settings and the database are in `./data`, and episodes are in `MEDIA_DIR`. Both survive `docker compose down`.
- **Linux permissions:** the container runs as uid 1000. Make both folders writable for it: `sudo chown -R 1000:1000 data media`.
- **Firewall on the host:** allow `HOST_PORT` (8096 by default). Linux: `sudo ufw allow 8096/tcp`.
- **mDNS:** network discovery doesn't pass through Docker's bridge network. On Linux, you can use `network_mode: host` (see the comment in `docker-compose.yml`). Docker Desktop doesn't support host networking. Setting `PUBLIC_URL` is the reliable way for other devices to find the server.

---

## Open it from outside your home

Same-Wi-Fi access only needs the LAN address (`http://192.168.1.111:8096`) and a firewall rule. To reach the server from mobile data, or from a Skyworth stick on another network, forward the port on the router that faces the internet.

**1. Give the server PC a fixed LAN address**

In the router admin page, reserve the PC's IP (DHCP reservation / IP & MAC binding) so `192.168.1.111` does not change.

**2. Forward TCP 8096**

On a **Mercusys AC1200** (and most Mercusys mesh units):

1. Open the router admin page (often `http://192.168.1.1` or `mwlogin.net`).
2. Go to **Advanced → Forwarding → Virtual Server**.
3. Add a rule:

| Field | Value |
|---|---|
| Service Port | `8096` |
| IP Address | The PC running Dramora, for example `192.168.1.111` |
| Internal Port | `8096` |
| Protocol | TCP |
| Status | Enabled |
| Common Service Port | Leave on "Please Select" |

4. Save.

Other routers call this **Port Forwarding**, **Virtual Server** or **NAT Forwarding**. The mapping is always: public port 8096 → the PC's LAN IP, port 8096, TCP.

**3. Allow the port on the PC**

- Windows: the firewall rule in [Step 9](#step-9-allow-the-app-through-windows-firewall), including the Public profile.
- Linux: `sudo ufw allow 8096/tcp`.
- Docker: compose already publishes `HOST_PORT`. You still have to forward that host port on the router. Do not forward to a Docker-internal address such as `172.17.0.2`.

**4. Set `PUBLIC_URL` to the public address**

Find the WAN IP on the router **Status** page. Then, in `.env`:

```dotenv
PUBLIC_URL=http://YOUR_PUBLIC_IP:8096
```

Restart so the app picks it up:

```sh
docker compose up -d
```

**5. Test from outside the house**

Turn Wi-Fi off on a phone (use mobile data) and open `http://YOUR_PUBLIC_IP:8096`. If that loads, the forward works.

If it only works on Wi-Fi:

- The forward points at the wrong LAN IP, or the PC's IP changed.
- Windows Firewall is still blocking public networks.
- The ISP uses CGNAT (the router's WAN IP is in `100.64.x.x`, `10.x`, or `192.168.x`). Port forwarding cannot work in that case. Use a VPS, or a tunnel such as Cloudflare Tunnel or Tailscale.

Set an admin password before the server is reachable from the internet.

---

## Android app

Dramora on Android is a player. It does not run the server. Install the APK on a phone or an Android TV stick (including Skyworth), then enter the server address.

On an Android phone, open Dramora in Chrome and tap **Install** on the banner (or **Install app** in the profile menu). That downloads `Dramora.apk` from this server. Open the download, allow installs from the browser if Android asks, and install it. The app then asks for this server's address the first time.

You can also copy the file yourself from `http://YOUR_SERVER:8096/dramora.apk`.

The stick and the server must be able to reach that address. A browser on the same device is a good test before you blame the APK.

---

## Using the app

### Finding shows

- **Home:** a slider of the most-viewed new series, then rows of larger cards with badges and play counts. Hover or focus a card for Play, My List and Share.
- **Browse:** latest releases, with *Load more*.
- **Search:** the box at the top shows suggestions as you type. Press Enter for full results.

Guests can look through all of that. Playing, listing and downloading ask you to sign in or request access.

### Accounts

- **Request access** on the login screen. An admin approves it under **Users**.
- Until approval, signing in stays blocked.
- Admins see a count of waiting requests in the menu.

### Downloading

1. Open a show to see its episode list.
2. Click **Download all**, or tick individual episodes and click **Download selected**.
3. Follow progress on the **Downloads** page.

On the **Downloads** page you can:

- pause and resume individual episodes, or all of them,
- retry failed episodes,
- remove items from the queue,
- **Clear completed**, which only tidies the list; your library keeps the episodes.

Failed downloads retry automatically, up to 4 attempts in total. Interrupted downloads resume where they stopped.

Files are saved as:

```
<download folder>/
└── Show Name/
    ├── Show Name - E01 - Episode 1.mp4
    ├── Show Name - E02 - Episode 2.mp4
    ├── show.json      (show details, used for library scans)
    └── poster.jpg
```

### Watching

- **Library** lists everything you've downloaded.
- Pick an episode to play it. Playback resumes where you left off, and an **Up next** countdown appears near the end of each episode.
- Admins can delete episodes, which also deletes the file, and run **Scan library** to pick up files that were added or removed outside the app.

### Profiles

The app starts with one admin profile called **Me**. You won't see a profile picker until you add more profiles.

- **Add profiles** (admins only): avatar menu → **Switch profile** → **Manage profiles**. Each person gets their own Continue Watching row and progress.
- **PINs:** a profile can have a 4 to 6 digit PIN. Wrong PINs are limited to 5 attempts per minute.
- **Users** can browse, download and watch. Only admins can change settings, manage profiles and delete episodes.

### Settings (admins)

Storage, language, proxy (with **Test connection**), download options, admin password, network discovery, system health and library scan.

---

## Proxy: why you may need one

Dramabox blocks API requests from some regions. From **South Africa**, for example, every API call fails with `HTTP 403 Access Denied`. Cover images still load, but browsing, searching and downloading don't. The app shows a banner with the error and links to Settings.

**Fix:** route the API traffic through a proxy outside the blocked region. The proxy carries the API calls and the MP4 downloads. Your LAN traffic (streaming to your devices) never goes through it. Port forwarding is unrelated: that lets people reach *your* server. The proxy lets *your server* reach Dramabox.

| Format | Example |
|---|---|
| HTTP | `http://host:3128` |
| HTTP with login | `http://user:pass@host:3128` |
| HTTPS proxy | `https://host:443` |
| SOCKS5 | `socks5://host:1080` or `socks5h://host:1080` (DNS resolved by the proxy) |

There are two ways to set it:

1. In the setup wizard or **Settings → Connection**, then **Test connection**. Look for an outgoing country other than yours and **Dramabox API reachable**.
2. With the environment variable `DRAMABOX_PROXY`, which overrides the saved value. In Docker, put it in `.env` and run `docker compose up -d`.

The password is masked as `***` in the web interface. It's stored in plain text in `data/config.json`, so keep that folder private.

> **Technical note.** The `@zhadev/dramabox` 0.0.2 library accepts a `proxy` option, but it ignores it. Dramora still passes the option (in case a future version supports it), and routes Dramabox traffic through the proxy itself.

---

## Configuration reference

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8096` | Port the server listens on inside the process or container |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` to allow only this machine. |
| `HOST_PORT` | `8096` | Docker only. Port published on the host. |
| `PUBLIC_URL` | none | Address other devices should open, such as `http://192.168.1.111:8096` |
| `DATA_DIR` | `./data` | Folder for settings and the database. `/data` in Docker. |
| `DEFAULT_DOWNLOAD_ROOT` | `~/Videos/Dramabox` (Windows) or `~/dramora` | Download folder suggested by the wizard (`/media` in Docker) |
| `MEDIA_DIR` | `./media` | Docker only. Host folder mapped to `/media`. |
| `DRAMABOX_PROXY` | none | Proxy URL; overrides the saved setting |
| `REQUEST_DELAY` | `2000` | Milliseconds between Dramabox API calls; overrides the saved setting |
| `DRAMABOX_LANG` | `en` | Catalogue language; overrides the saved setting |
| `DRAMABOX_MOCK` | off | `1` serves sample data instead of the real API |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `TZ` | `UTC` | Time zone (Docker) |

**Setting a variable:**

| Shell | Command |
|---|---|
| PowerShell (current window) | `$env:PORT = "8097"; npm start` |
| macOS/Linux | `PORT=8097 npm start` |
| Docker | put it in `.env`, then `docker compose up -d` |

### Where your data lives

| Path | Contents |
|---|---|
| `data/config.json` | Settings. Includes the proxy URL in plain text and a hash of the admin password. |
| `data/library.db` | Library, download queue, profiles, watch progress, sessions (SQLite). |
| `<download folder>/<Show>/` | Episodes, plus `show.json` and `poster.jpg`. Unfinished downloads end in `.part`. |

**Back up the `data` folder.** If the database is ever lost, **Settings → Scan library** rebuilds the library from the files on disk.

### Ports and URLs

| URL | Purpose |
|---|---|
| `http://<host>:8096/` | Web app |
| `http://<host>:8096/api/health` | Health check (no login needed): version, uptime, disk space, queue counts |

---

## Updating

**From source:**

```sh
cd LocalDrama
git pull
npm install
npm run build
```

Then restart the server. On Windows with the scheduled task, run `Stop-ScheduledTask` and then `Start-ScheduledTask -TaskName "Dramora"`.

**Docker:**

```sh
git pull
docker compose up -d --build
```

Your settings, database and episodes are kept across updates. Database changes are applied automatically.

---

## Troubleshooting

<details>
<summary><b>npm install fails</b></summary>

- Make sure Node.js is **v22** or newer (`node -v`).
- Delete `node_modules` and `package-lock.json` in the root, `server/`, and `web/`, then run `npm install` again.
- On Windows, run PowerShell as administrator if you see permission errors.
</details>

<details>
<summary><b>The page is blank or "Cannot GET /"</b></summary>

Run `npm run build` first. The server serves the built files from `web/dist`. With Docker, `docker compose up -d --build` builds the web UI into the image.
</details>

<details>
<summary><b>API blocked / 403 Access Denied</b></summary>

You are in a region that Dramabox blocks. Set a proxy in Settings → Connection and test it. The outgoing country must not be your own. In Docker, set `DRAMABOX_PROXY` in `.env` and run `docker compose up -d`.
</details>

<details>
<summary><b>Downloads fail with "permission denied" (EACCES)</b></summary>

The download folder must exist and be writable **where the server runs**. Inside Docker that means a path in the container, not a Windows path from the host.

- Open **Settings → Storage** and set the folder to `/media` (the container path), then save.
- `/media` is mapped to the host folder set by `MEDIA_DIR` in `.env` (default `./media`).
- On Linux, `sudo chown -R 1000:1000 data media`.
- Retry the failed downloads afterwards.
</details>

<details>
<summary><b>The phone or stick cannot open the server</b></summary>

- On the same Wi-Fi, use the PC's LAN address (`http://192.168.1.111:8096`), not `localhost`.
- In Docker, set `PUBLIC_URL` to that LAN address and restart compose.
- Check the host firewall allows TCP 8096.
- From mobile data, the router must forward TCP 8096 to the PC. See [Open it from outside your home](#open-it-from-outside-your-home).
</details>

<details>
<summary><b>The video doesn't play</b></summary>

- Wait until the episode shows as *Completed*; unfinished `.part` files don't play.
- Try another browser. In the Android app, use **Reload** from the Back menu.
</details>

---

## Known limitations

- **Show details come from list data.** Dramabox's "drama detail" endpoints are broken upstream: they return "Drama not found", even in the client library's own examples. Dramora builds the show page from information seen while browsing or searching, plus the episode list. A show you open from a direct link may have no description until it has appeared in a list.
- **720p maximum.** 1080p streams need an upstream Dramabox VIP account. The app picks the best non-VIP quality at or below your setting.
- **Region blocks.** In blocked regions, the app needs a proxy for everything except cover images.
- **Unofficial API.** Dramabox can change or block its API at any time, and the client library may need updating when it does.

---

## Development

```sh
npm run dev        # server with auto-reload on :8096 + Vite dev server on :5173
npm run dev:mock   # the same, with sample data
```

During development, open **http://localhost:5173**. Vite forwards `/api` and `/media` requests to the server.

| Path | What it is |
|---|---|
| `server/` | Node 22, Fastify 5, better-sqlite3, plain ES modules. Entry point: `server/src/index.js`. |
| `server/fixtures/` | Recorded API responses and a test video, used by mock mode. |
| `web/` | React 19, Vite, TypeScript, Tailwind CSS v4, React Router. |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | Container build, run, and the env template. |
| `PLAN.md` | Design decisions, the API contract, and the phase-by-phase spec. |
| `Dramabox-Server-Specification.md` | Original product specification. |

`server/` and `web/` are separate npm packages, each with its own `package-lock.json`. The root `npm install` installs both.
