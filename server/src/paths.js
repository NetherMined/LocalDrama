const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const WINDOWS_PATH = /^[a-zA-Z]:[\\/]/;
const UNC_PATH = /^\\\\/;

/** True for `C:\...`, `C:/...` and `\\server\share` paths. */
export function isWindowsPath(value) {
  return WINDOWS_PATH.test(String(value ?? '')) || UNC_PATH.test(String(value ?? ''));
}

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
