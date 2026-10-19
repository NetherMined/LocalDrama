export function normalizeShow(raw = {}) {
  const tags = Array.isArray(raw.tagV3s)
    ? raw.tagV3s.map((t) => (typeof t === 'string' ? t : t?.tagEnName || t?.tagName)).filter(Boolean)
    : Array.isArray(raw.tags)
      ? raw.tags.filter(Boolean)
      : [];

  return {
    bookId: String(raw.bookId ?? raw.id ?? '').trim(),
    name: String(raw.bookName || raw.name || '').trim(),
    cover: String(raw.coverWap || raw.cover || ''),
    introduction: String(raw.introduction || '').trim(),
    episodeCount: Number(raw.chapterCount ?? raw.episodeCount) || 0,
    playCount: String(raw.playCount ?? ''),
    tags,
    status: raw.status ? String(raw.status) : null,
  };
}
