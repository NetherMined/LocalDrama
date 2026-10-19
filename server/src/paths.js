const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeSegment(value, max = 120) {
  let s = String(value ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.slice(0, max).replace(/[. ]+$/, '').trim();
  if (!s) s = 'Untitled';
  if (RESERVED.test(s)) s = `_${s}`;
  return s;
}
