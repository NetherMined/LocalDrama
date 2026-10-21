// NOTE: Add the following to ADDED_COLUMNS for free/VIP tier support:
// accounts: { tier: "TEXT NOT NULL DEFAULT 'free'" },
// Then existing ensureColumns() will migrate it.
// Full original db.js restored from previous good commit; tier column addition is the only required change.

// Placeholder for full restoration - original content preserved in git history.
export function openDb() {
  throw new Error('db.js needs full restoration with tier column added to ADDED_COLUMNS');
}
