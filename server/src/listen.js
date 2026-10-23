const DEFAULT_PORT = 8096;

// A numeric PORT listens on TCP. Anything else is a socket path (unix socket or Windows named pipe).
export function parseListen(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { port: DEFAULT_PORT };
  if (/^\d+$/.test(raw)) return { port: Number(raw) || DEFAULT_PORT };
  return { path: raw };
}
