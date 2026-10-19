import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const PROXIED_HOST = /(^|\.)(dramaboxdb\.com|webfic\.com)$/i;
const HTTP_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
const SOCKS_PROTOCOLS = new Set(['socks5:', 'socks5h:', 'socks4:']);

let currentAgent;
let currentUrl = '';
let patched = false;

export function parseProxyUrl(input) {
  const url = String(input || '').trim();
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid proxy URL: ${maskProxyUrl(url)}`);
  }
  if (!HTTP_PROXY_PROTOCOLS.has(parsed.protocol) && !SOCKS_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('Proxy URL must start with http://, https://, socks5://, socks5h:// or socks4://');
  }
  if (!parsed.hostname) throw new Error('Proxy URL is missing a host');
  return url;
}

export async function buildAgent(input) {
  const url = parseProxyUrl(input);
  if (!url) return undefined;
  const protocol = new URL(url).protocol;
  if (HTTP_PROXY_PROTOCOLS.has(protocol)) {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    return new HttpsProxyAgent(url);
  }
  const { SocksProxyAgent } = await import('socks-proxy-agent');
  return new SocksProxyAgent(url);
}

export async function setProxy(input) {
  const url = parseProxyUrl(input);
  currentAgent = await buildAgent(url);
  currentUrl = url;
}

export function getAgent() {
  return currentAgent;
}

export function getProxyUrl() {
  return currentUrl;
}

export function isProxiedHost(hostname) {
  return PROXIED_HOST.test(String(hostname || ''));
}

export function maskProxyUrl(input) {
  if (!input) return '';
  try {
    const u = new URL(input);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '***';
  }
}

function prepareArgs(args) {
  const a = [...args];
  let opts = null;
  let host = '';

  if (typeof a[0] === 'string' || a[0] instanceof URL) {
    host = new URL(a[0]).hostname;
    if (a[1] && typeof a[1] === 'object' && typeof a[1] !== 'function') {
      opts = a[1];
    } else {
      opts = {};
      a.splice(1, 0, opts);
    }
  } else if (a[0] && typeof a[0] === 'object') {
    opts = a[0];
    host = opts.hostname || opts.host || '';
  }

  if (!opts || !currentAgent || !isProxiedHost(host)) return a;
  const existing = opts.agent?.constructor?.name;
  if (existing === 'HttpsProxyAgent' || existing === 'SocksProxyAgent') return a;

  const original = opts.agent?.options || {};
  if (original.ciphers) opts.ciphers = original.ciphers;
  if (original.rejectUnauthorized !== undefined) opts.rejectUnauthorized = original.rejectUnauthorized;
  opts.agent = currentAgent;
  return a;
}

export function installHttpsPatch() {
  if (patched) return;
  patched = true;
  const origRequest = https.request;
  const origGet = https.get;
  https.request = function request(...args) {
    return origRequest.apply(this, prepareArgs(args));
  };
  https.get = function get(...args) {
    return origGet.apply(this, prepareArgs(args));
  };
  // The client uses `await import('https')`; ESM namespaces of builtins only see the patch after a sync.
  syncBuiltinESMExports();
}
