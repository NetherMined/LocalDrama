import crypto from 'node:crypto';
import { getConfig } from './config.js';
import { parseCount } from './normalize.js';

const POPULAR_REFRESH_MS = 24 * 60 * 60 * 1000;
// A platform needs this many ranked series before "top 20 %" means anything.
const POPULAR_MIN_RANKED = 10;
const STREAM_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

// Access a viewer has to a show or episode:
//   free      not VIP content
//   vip       VIP content this viewer cannot watch (locked)
//   unlocked  VIP content this viewer can watch (VIP account, or an unlock)
export const ACCESS_FREE = 'free';
export const ACCESS_VIP = 'vip';
export const ACCESS_UNLOCKED = 'unlocked';

function plan() {
  return getConfig().plan;
}

export function isVipAccount(account, now = Date.now()) {
  if (!account) return false;
  if (account.role === 'admin') return true;
  return account.tier === 'vip' && (!account.vipUntil || Date.parse(account.vipUntil) > now);
}

export function isVipPlatform(sourceId) {
  return !!sourceId && plan().vipPlatforms.includes(sourceId);
}

// The show as the entitlement check sees it: the platform actually being asked (?source=)
// wins over the cached one, and a show that isn't cached yet is still gated by its platform.
export function gatedShow(show, bookId, source) {
  return { ...(show || { bookId: String(bookId) }), source: source || show?.source || getConfig().activeSourceId || null };
}

export function createEntitlements(db) {
  const raw = db.raw;
  const playCountsStmt = raw.prepare("SELECT sourceId, playCount FROM shows WHERE sourceId IS NOT NULL AND playCount <> ''");
  const activeUnlocksStmt = raw.prepare('SELECT * FROM unlocks WHERE accountId = ? AND (expiresAt IS NULL OR expiresAt > ?)');
  const insertUnlockStmt = raw.prepare(`
    INSERT INTO unlocks (accountId, kind, ref, fromEp, toEp, expiresAt, reason, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const onMyListStmt = raw.prepare(`
    SELECT 1 FROM favourites f JOIN profiles p ON p.id = f.profileId
    WHERE p.accountId = ? AND f.bookId = ? LIMIT 1
  `);
  // Stream tokens only need to survive the process: the player asks for a new stream URL after a restart.
  const streamSecret = crypto.randomBytes(32);
  let popular = { at: 0, share: null, thresholds: new Map() };

  // Per platform, the lowest play count that is still in the top popularShare.
  function popularThresholds() {
    const share = plan().popularShare;
    if (popular.share === share && Date.now() - popular.at < POPULAR_REFRESH_MS) return popular.thresholds;
    const bySource = new Map();
    for (const row of playCountsStmt.all()) {
      const plays = parseCount(row.playCount);
      if (plays <= 0) continue;
      if (!bySource.has(row.sourceId)) bySource.set(row.sourceId, []);
      bySource.get(row.sourceId).push(plays);
    }
    const thresholds = new Map();
    if (share > 0) {
      for (const [sourceId, counts] of bySource) {
        if (counts.length < POPULAR_MIN_RANKED) continue;
        counts.sort((a, b) => b - a);
        thresholds.set(sourceId, counts[Math.max(0, Math.ceil(counts.length * share) - 1)]);
      }
    }
    popular = { at: Date.now(), share, thresholds };
    return thresholds;
  }

  // Why a show is VIP-only ('platform' | 'popular'), or null when it is free.
  function vipReason(show) {
    const sourceId = show?.source;
    if (!sourceId) return null;
    if (isVipPlatform(sourceId)) return 'platform';
    const plays = parseCount(show.playCount);
    if (plays <= 0) return null;
    const { popularMinPlays } = plan();
    if (popularMinPlays > 0 && plays >= popularMinPlays) return 'popular';
    const threshold = popularThresholds().get(sourceId);
    return threshold !== undefined && plays >= threshold ? 'popular' : null;
  }

  // Loads the account's unlocks once, so a page of shows costs one query.
  function viewer(account) {
    const vip = isVipAccount(account);
    const unlocks = account && !vip ? activeUnlocksStmt.all(account.id, new Date().toISOString()) : [];
    const has = (kind, ref) => unlocks.some((u) => u.kind === kind && u.ref === ref);

    function showAccess(show) {
      if (!vipReason(show)) return ACCESS_FREE;
      if (vip || has('series', String(show.bookId)) || has('platform', show.source)) return ACCESS_UNLOCKED;
      return ACCESS_VIP;
    }

    function episodeAccess(show, index) {
      const access = showAccess(show);
      if (access !== ACCESS_VIP) return access;
      const covered = unlocks.some(
        (u) => u.kind === 'episodes' && u.ref === String(show.bookId) && index >= u.fromEp && index <= u.toEp,
      );
      return covered ? ACCESS_UNLOCKED : ACCESS_VIP;
    }

    return {
      vip,
      showAccess,
      episodeAccess,
      annotate: (items) => items.map((s) => ({ ...s, access: showAccess(s) })),
    };
  }

  function seriesPrice(accountId, bookId) {
    const { prices } = plan();
    return onMyListStmt.get(accountId, String(bookId)) ? prices.seriesMyList : prices.series;
  }

  // null when the account may watch the episode; otherwise the error details for the player.
  function lockFor(account, show, index) {
    if (viewer(account).episodeAccess(show, index) !== ACCESS_VIP) return null;
    const { prices, episodesPerUnlock, platformUnlockHours } = plan();
    const reason = vipReason(show);
    const options = [
      { kind: 'episodes', fromEp: index, toEp: index + episodesPerUnlock - 1, cost: prices.episodes },
      { kind: 'series', cost: seriesPrice(account.id, show.bookId) },
    ];
    if (reason === 'platform') {
      options.push({ kind: 'platform', ref: show.source, hours: platformUnlockHours, cost: prices.platform });
    }
    return { reason, bookId: String(show.bookId), source: show.source, episode: index, options };
  }

  function addUnlock(accountId, { kind, ref, fromEp = null, toEp = null, expiresAt = null, reason = null }) {
    insertUnlockStmt.run(accountId, kind, String(ref), fromEp, toEp, expiresAt, reason, new Date().toISOString());
  }

  function activeUnlocks(accountId) {
    return activeUnlocksStmt.all(accountId, new Date().toISOString());
  }

  function sign(payload) {
    return crypto.createHmac('sha256', streamSecret).update(payload).digest('base64url');
  }

  // Ties /api/hls requests to a stream URL the server handed out, so the proxy can't be used
  // to fetch VIP streams that never passed the entitlement check.
  function streamToken(accountId) {
    const payload = `${accountId}.${Date.now() + STREAM_TOKEN_TTL_MS}`;
    return `${payload}.${sign(payload)}`;
  }

  function checkStreamToken(token, accountId) {
    const [id, exp, sig] = String(token || '').split('.');
    if (!sig || Number(id) !== accountId || !(Number(exp) > Date.now())) return false;
    const expected = Buffer.from(sign(`${id}.${exp}`));
    const actual = Buffer.from(sig);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  return {
    vipReason,
    viewer,
    lockFor,
    seriesPrice,
    addUnlock,
    activeUnlocks,
    streamToken,
    checkStreamToken,
  };
}
