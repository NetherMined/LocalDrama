import crypto from 'node:crypto';
import { getConfig } from './config.js';
import { httpError } from './errors.js';
import { gatedShow, isVipAccount, isVipPlatform } from './entitlements.js';

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const SHARE_CODE_LENGTH = 8;
export const SHARE_CODE_RE = /^[A-Za-z0-9]{8}$/;
const HISTORY_LIMIT = 30;
const RECENT_SERIES_LIMIT = 10;
const RANDOM_SERIES_SAMPLE = 200;
// How far past the last watched episode the daily reward looks for a locked one.
const NEXT_LOCKED_SCAN = 50;
const FALLBACK_POINTS = 20;

function plan() {
  return getConfig().plan;
}

// Calendar day in the server's time zone (TZ in docker-compose), YYYY-MM-DD.
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function previousDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

function randomCode() {
  let out = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) out += SHARE_CODE_ALPHABET[crypto.randomInt(SHARE_CODE_ALPHABET.length)];
  return out;
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight || 0), 0);
  if (total <= 0) return entries[0];
  let roll = crypto.randomInt(total);
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight || 0);
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

export function createRewards(db, { accounts, entitlements }) {
  const raw = db.raw;
  const stmts = {
    insertPoints: raw.prepare('INSERT INTO points_ledger (accountId, delta, reason, ref, day, createdAt) VALUES (?, ?, ?, ?, ?, ?)'),
    balance: raw.prepare('SELECT COALESCE(SUM(delta), 0) AS n FROM points_ledger WHERE accountId = ?'),
    history: raw.prepare('SELECT id, delta, reason, ref, createdAt FROM points_ledger WHERE accountId = ? ORDER BY id DESC LIMIT ?'),
    countOnDay: raw.prepare('SELECT COUNT(*) AS n FROM points_ledger WHERE accountId = ? AND reason = ? AND day = ?'),
    daily: raw.prepare('SELECT * FROM daily_rewards WHERE accountId = ? AND day = ?'),
    lastDaily: raw.prepare('SELECT * FROM daily_rewards WHERE accountId = ? ORDER BY day DESC LIMIT 1'),
    insertDaily: raw.prepare('INSERT INTO daily_rewards (accountId, day, kind, value, ref, streak, claimedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    activeDays: raw.prepare('SELECT COUNT(*) AS n FROM daily_rewards WHERE accountId = ?'),
    giftCount: raw.prepare("SELECT COUNT(*) AS n FROM unlocks WHERE accountId = ? AND reason = 'welcome_gift'"),
    recentSeries: raw.prepare(`
      SELECT wp.bookId, MAX(wp.sourceId) AS sourceId, MAX(wp.episodeIndex) AS lastEp, MAX(wp.updatedAt) AS at
      FROM watch_progress wp JOIN profiles p ON p.id = wp.profileId
      WHERE p.accountId = ? GROUP BY wp.bookId ORDER BY at DESC LIMIT ?
    `),
    myList: raw.prepare(`
      SELECT f.bookId FROM favourites f JOIN profiles p ON p.id = f.profileId
      WHERE p.accountId = ? GROUP BY f.bookId ORDER BY MAX(f.createdAt) DESC
    `),
    randomShows: raw.prepare('SELECT bookId FROM shows WHERE sourceId IS NOT NULL ORDER BY RANDOM() LIMIT ?'),
    linkByOwner: raw.prepare('SELECT * FROM share_links WHERE accountId = ? AND bookId = ?'),
    link: raw.prepare('SELECT * FROM share_links WHERE code = ?'),
    insertLink: raw.prepare('INSERT INTO share_links (code, accountId, bookId, sourceId, createdAt) VALUES (?, ?, ?, ?, ?)'),
    insertOpen: raw.prepare('INSERT OR IGNORE INTO share_opens (code, accountId, createdAt) VALUES (?, ?, ?)'),
  };

  function balance(accountId) {
    return stmts.balance.get(accountId).n;
  }

  function addPoints(accountId, delta, reason, ref = null) {
    const now = new Date();
    stmts.insertPoints.run(accountId, delta, reason, ref, localDay(now), now.toISOString());
  }

  function showFor(bookId, sourceId) {
    return gatedShow(db.getShow(bookId), bookId, sourceId);
  }

  function showName(bookId) {
    return db.getShow(bookId)?.name || 'a series';
  }

  // A random series this account can't watch yet, preferring the given bookIds (My List).
  function lockedSeries(account, preferred = []) {
    const viewer = entitlements.viewer(account);
    const isLocked = (bookId) => {
      const show = db.getShow(bookId);
      return show && viewer.showAccess(show) === 'vip' ? show : null;
    };
    const fromList = preferred.map(isLocked).filter(Boolean);
    if (fromList.length) return fromList[crypto.randomInt(fromList.length)];
    for (const { bookId } of stmts.randomShows.all(RANDOM_SERIES_SAMPLE)) {
      const show = isLocked(bookId);
      if (show) return show;
    }
    return null;
  }

  // The first locked episode after where the account last watched, in a series it is watching.
  function nextLockedEpisodes(account) {
    const viewer = entitlements.viewer(account);
    for (const row of stmts.recentSeries.all(account.id, RECENT_SERIES_LIMIT)) {
      const show = showFor(row.bookId, row.sourceId);
      if (viewer.showAccess(show) !== 'vip') continue;
      const last = show.episodeCount > 0 ? show.episodeCount - 1 : row.lastEp + NEXT_LOCKED_SCAN;
      for (let i = row.lastEp + 1; i <= Math.min(last, row.lastEp + NEXT_LOCKED_SCAN); i++) {
        if (viewer.episodeAccess(show, i) === 'vip') return { show, fromEp: i };
      }
    }
    return null;
  }

  // One welcome series on the first visit, then one more for every welcomeGiftEveryDays days claimed.
  function grantDueGifts(account) {
    if (isVipAccount(account)) return [];
    const every = Math.max(1, plan().welcomeGiftEveryDays);
    const due = 1 + Math.floor(stmts.activeDays.get(account.id).n / every);
    const granted = [];
    raw.transaction(() => {
      for (let count = stmts.giftCount.get(account.id).n; count < due; count++) {
        const show = lockedSeries(account);
        if (!show) break;
        entitlements.addUnlock(account.id, { kind: 'series', ref: show.bookId, reason: 'welcome_gift' });
        granted.push({ bookId: show.bookId, name: show.name, source: show.source });
      }
    })();
    for (const gift of granted) {
      const first = due === 1;
      accounts.notify(
        account.id,
        'reward',
        first ? 'Welcome gift: a free VIP series' : 'Activity gift: another VIP series',
        `${gift.name} is unlocked for you to watch in full.`,
        `/show/${encodeURIComponent(gift.bookId)}${gift.source ? `?source=${encodeURIComponent(gift.source)}` : ''}`,
      );
    }
    return granted;
  }

  function currentStreak(accountId) {
    const last = stmts.lastDaily.get(accountId);
    if (!last) return 0;
    const today = localDay();
    return last.day === today || last.day === previousDay(today) ? last.streak : 0;
  }

  function claimDaily(account) {
    const day = localDay();
    const settings = plan();
    const result = raw.transaction(() => {
      if (stmts.daily.get(account.id, day)) throw httpError(409, 'already_claimed');
      const last = stmts.lastDaily.get(account.id);
      const streak = last && last.day === previousDay(day) ? last.streak + 1 : 1;
      const picked = pickWeighted(settings.dailyRewards);
      const pointsEntry = settings.dailyRewards.find((r) => r.kind === 'points');
      let reward = null;

      if (picked.kind === 'episodes') {
        const next = nextLockedEpisodes(account);
        if (next) {
          const toEp = next.fromEp + picked.value - 1;
          entitlements.addUnlock(account.id, { kind: 'episodes', ref: next.show.bookId, fromEp: next.fromEp, toEp, reason: 'daily_reward' });
          reward = { kind: 'episodes', value: picked.value, bookId: next.show.bookId, name: next.show.name, source: next.show.source, fromEp: next.fromEp, toEp };
        }
      } else if (picked.kind === 'series') {
        const show = lockedSeries(account, stmts.myList.all(account.id).map((r) => r.bookId));
        if (show) {
          entitlements.addUnlock(account.id, { kind: 'series', ref: show.bookId, reason: 'daily_reward' });
          reward = { kind: 'series', value: 1, bookId: show.bookId, name: show.name, source: show.source };
        }
      }
      // Nothing locked to unlock (or a VIP account): the reward becomes points.
      if (!reward) {
        const value = picked.kind === 'points' ? picked.value : pointsEntry?.value || FALLBACK_POINTS;
        addPoints(account.id, value, 'daily_reward', day);
        reward = { kind: 'points', value };
      }

      const bonus = settings.streakDays > 0 && streak % settings.streakDays === 0 ? settings.streakBonus : 0;
      if (bonus > 0) addPoints(account.id, bonus, 'streak_bonus', day);
      stmts.insertDaily.run(account.id, day, reward.kind, reward.value, reward.bookId ?? null, streak, new Date().toISOString());
      return { reward, streak, bonus };
    })();

    const { reward, streak, bonus } = result;
    const what =
      reward.kind === 'points' ? `+${reward.value} points`
        : reward.kind === 'episodes' ? `Episodes ${reward.fromEp + 1}-${reward.toEp + 1} of ${reward.name} unlocked`
          : `${reward.name} unlocked in full`;
    accounts.notify(account.id, 'reward', 'Daily reward', bonus ? `${what}, plus a ${streak}-day streak bonus of ${bonus} points.` : `${what}.`, '/rewards');
    grantDueGifts(account);
    return { ...result, balance: balance(account.id) };
  }

  function createShare(account, bookId, sourceId) {
    const existing = stmts.linkByOwner.get(account.id, bookId);
    if (existing) return { code: existing.code, path: `/s/${existing.code}` };
    let code = randomCode();
    while (stmts.link.get(code)) code = randomCode();
    stmts.insertLink.run(code, account.id, bookId, sourceId || db.getShow(bookId)?.source || null, new Date().toISOString());
    return { code, path: `/s/${code}` };
  }

  // Called when the share sheet completed or the link was copied.
  function completeShare(account, code) {
    const link = stmts.link.get(code);
    if (!link || link.accountId !== account.id) throw httpError(404, 'Share link not found');
    const { sharePoints, shareMaxPerDay } = plan();
    const day = localDay();
    const points = raw.transaction(() => {
      if (stmts.countOnDay.get(account.id, 'share', day).n >= shareMaxPerDay) return 0;
      addPoints(account.id, sharePoints, 'share', code);
      return sharePoints;
    })();
    return {
      points,
      sharesToday: stmts.countOnDay.get(account.id, 'share', day).n,
      maxPerDay: shareMaxPerDay,
      balance: balance(account.id),
    };
  }

  // Someone else opened a shared link while signed in: credits the sharer once per visitor.
  function openShare(code, visitor) {
    const link = SHARE_CODE_RE.test(code || '') ? stmts.link.get(code) : null;
    if (!link || !visitor || link.accountId === visitor.id) return link;
    const bonus = plan().shareJoinBonus;
    const credited = raw.transaction(() => {
      if (stmts.insertOpen.run(code, visitor.id, new Date().toISOString()).changes === 0) return false;
      addPoints(link.accountId, bonus, 'share_join', code);
      return true;
    })();
    if (credited) {
      accounts.notify(link.accountId, 'reward', 'Your share paid off', `${visitor.username} opened ${showName(link.bookId)}. +${bonus} points.`, '/rewards');
    }
    return link;
  }

  function linkFor(code) {
    return SHARE_CODE_RE.test(code || '') ? stmts.link.get(code) : null;
  }

  function purchase(account, { kind, bookId, source, fromEp }) {
    if (isVipAccount(account)) throw httpError(400, 'VIP accounts already have full access');
    const settings = plan();
    const viewer = entitlements.viewer(account);
    let cost;
    let unlock;

    if (kind === 'series' || kind === 'episodes') {
      if (!bookId) throw httpError(400, 'bookId is required');
      const show = showFor(String(bookId), source);
      if (kind === 'series') {
        if (viewer.showAccess(show) !== 'vip') throw httpError(400, 'This series is not locked');
        cost = entitlements.seriesPrice(account.id, show.bookId);
        unlock = { kind, ref: show.bookId };
      } else {
        const from = Number(fromEp);
        if (!Number.isInteger(from) || from < 0) throw httpError(400, 'fromEp must be an episode index');
        if (viewer.episodeAccess(show, from) !== 'vip') throw httpError(400, 'This episode is not locked');
        cost = settings.prices.episodes;
        unlock = { kind, ref: show.bookId, fromEp: from, toEp: from + settings.episodesPerUnlock - 1 };
      }
    } else if (kind === 'platform') {
      if (!isVipPlatform(source)) throw httpError(400, 'Only VIP platforms can be unlocked');
      if (entitlements.activeUnlocks(account.id).some((u) => u.kind === 'platform' && u.ref === source)) {
        throw httpError(400, 'This platform is already unlocked');
      }
      cost = settings.prices.platform;
      unlock = { kind, ref: source, expiresAt: new Date(Date.now() + settings.platformUnlockHours * 3600 * 1000).toISOString() };
    } else {
      throw httpError(400, 'kind must be series, episodes or platform');
    }

    raw.transaction(() => {
      const have = balance(account.id);
      if (have < cost) throw httpError(400, 'not_enough_points', { balance: have, cost });
      addPoints(account.id, -cost, `shop_${kind}`, unlock.ref);
      entitlements.addUnlock(account.id, { ...unlock, reason: 'shop' });
    })();
    return { cost, unlock, balance: balance(account.id) };
  }

  function summary(account) {
    const gifts = grantDueGifts(account);
    const settings = plan();
    const today = stmts.daily.get(account.id, localDay());
    return {
      vip: isVipAccount(account),
      balance: balance(account.id),
      streak: currentStreak(account.id),
      daily: { claimed: !!today, reward: today ? { kind: today.kind, value: today.value, bookId: today.ref } : null },
      shares: { today: stmts.countOnDay.get(account.id, 'share', localDay()).n, max: settings.shareMaxPerDay },
      gifts,
      unlocks: entitlements.activeUnlocks(account.id).map((u) => ({
        kind: u.kind,
        ref: u.ref,
        name: u.kind === 'platform' ? (getConfig().sources || []).find((s) => s.id === u.ref)?.name || u.ref : showName(u.ref),
        fromEp: u.fromEp,
        toEp: u.toEp,
        expiresAt: u.expiresAt,
        reason: u.reason,
      })),
      history: stmts.history.all(account.id, HISTORY_LIMIT),
      rules: {
        prices: settings.prices,
        sharePoints: settings.sharePoints,
        shareJoinBonus: settings.shareJoinBonus,
        streakDays: settings.streakDays,
        streakBonus: settings.streakBonus,
        episodesPerUnlock: settings.episodesPerUnlock,
        platformUnlockHours: settings.platformUnlockHours,
        vipPlatforms: settings.vipPlatforms,
      },
    };
  }

  return { summary, claimDaily, grantDueGifts, createShare, completeShare, openShare, linkFor, purchase, balance };
}
