const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 2;

export function createFollowChecker({ db, provider, accounts, log }) {
  const raw = db.raw;
  const followsOfBook = raw.prepare('SELECT * FROM follows WHERE bookId = ?');
  const dueBooks = raw.prepare(`
    SELECT bookId, MAX(sourceId) AS sourceId, MAX(checkedAt) AS checkedAt
    FROM follows GROUP BY bookId
  `);
  const markChecked = raw.prepare('UPDATE follows SET knownEpisodes = ?, checkedAt = ? WHERE bookId = ? AND accountId = ?');
  const markCheckedOnly = raw.prepare('UPDATE follows SET checkedAt = ? WHERE bookId = ?');

  // Compares the episode count with what each follower last saw and notifies the ones behind.
  // A follow with no known baseline (0) only records the count; it does not announce every episode.
  function checkBook(bookId, episodeCount) {
    const count = Number(episodeCount) || 0;
    if (count <= 0) return;
    const now = new Date().toISOString();
    const rows = followsOfBook.all(String(bookId));
    if (rows.length === 0) return;
    const name = db.getShow(bookId)?.name || String(bookId);
    for (const row of rows) {
      if (row.knownEpisodes > 0 && count > row.knownEpisodes) {
        const added = count - row.knownEpisodes;
        const link = `/show/${encodeURIComponent(String(bookId))}${row.sourceId ? `?source=${encodeURIComponent(row.sourceId)}` : ''}`;
        accounts.notify(
          row.accountId,
          'new_episodes',
          `New episodes of ${name}`,
          `${added} new episode${added === 1 ? '' : 's'} ${added === 1 ? 'is' : 'are'} available.`,
          link,
        );
      }
      markChecked.run(count, now, String(bookId), row.accountId);
    }
  }

  async function checkDue(now = Date.now()) {
    const due = dueBooks
      .all()
      .filter((b) => !b.checkedAt || now - Date.parse(b.checkedAt) >= CHECK_INTERVAL_MS);
    let next = 0;
    async function worker() {
      while (next < due.length) {
        const book = due[next++];
        try {
          const { chapters } = await provider.chapters(book.bookId, { sourceId: book.sourceId || undefined });
          if (chapters?.length) checkBook(book.bookId, chapters.length);
          else markCheckedOnly.run(new Date().toISOString(), String(book.bookId));
        } catch (err) {
          log?.warn?.(`Follow check failed for ${book.bookId}: ${err.message}`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));
  }

  let timer = null;
  function start() {
    if (timer) return;
    timer = setInterval(() => {
      checkDue().catch((err) => log?.warn?.(`Follow check run failed: ${err.message}`));
    }, CHECK_INTERVAL_MS);
    timer.unref();
  }

  return { checkBook, checkDue, start };
}
