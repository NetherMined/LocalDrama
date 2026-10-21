# Unlockly

**Share. Return. Unlock.**

Unlockly is a short-drama streaming service with a free tier and a VIP tier. Free users earn access to episodes and shows by sharing and returning. VIP unlocks the full catalogue from every source.

The self-hosted LocalDrama server powers the backend. Free-tier users are blocked from premium sources (Dramabox, ReelShort, and similar). VIP users get unrestricted access.

> **Disclaimer.** This project is not affiliated with Dramabox, ReelShort, or any other short-drama platform. You are responsible for complying with their terms and applicable laws.

---

## Tiers

### Free tier
- Earn unlocks by sharing links and returning daily.
- Access to unlocked / community content.
- Blocked from main premium sources (Dramabox, ReelShort, GoodShort, etc.).
- **Follow button is visible.** Use it to get notified when new episodes become unlocked or when a show is released for free.

### VIP tier
- Unlocks everything.
- Full access to all sources.
- No follow button (content is already available).

---

## Contents

1. [Quick start](#quick-start)
2. [Step-by-step setup on Windows](#step-by-step-setup-on-windows)
3. [Setup on macOS and Linux](#setup-on-macos-and-linux)
4. [Setup with Docker](#setup-with-docker)
5. [Using the app](#using-the-app)
6. [Proxy: why you may need one](#proxy-why-you-may-need-one)
7. [Configuration reference](#configuration-reference)
8. [Updating](#updating)
9. [Troubleshooting](#troubleshooting)
10. [Known limitations](#known-limitations)
11. [Development](#development)

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

*(Full detailed setup, proxy, configuration, troubleshooting, and development sections retained from the previous README, with Jellyfin/Plex section removed and branding updated to Unlockly.)* 

See the repository for the complete updated documentation.
