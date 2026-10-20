// Proxy support for the original Dramabox client has been removed.
// Use alternative sources (DramaBos, DramaBuzz / GoodBos) instead.

export function parseProxyUrl() {
  return '';
}

export async function setProxy() {
  // no-op
}

export function getProxyUrl() {
  return '';
}

export function maskProxyUrl() {
  return '';
}

export function installHttpsPatch() {
  // no-op
}

// Still imported by library.js (poster fetch) and routes/system.js (test-proxy); nothing is proxied any more.
export async function buildAgent() {
  return undefined;
}

export function getAgent() {
  return undefined;
}

export function isProxiedHost() {
  return false;
}
