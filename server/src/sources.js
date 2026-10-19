import { httpError } from './errors.js';

const SOURCES = {
  dramabox: {
    id: 'dramabox',
    name: 'Dramabox (official)',
    description: 'Official unofficial client. Requires a proxy from restricted regions.',
    needs: ['proxyUrl'],
  },
  dramabos: {
    id: 'dramabos',
    name: 'DramaBos',
    description: 'Third-party aggregator API. Needs an API key. Works without proxy.',
    needs: ['apiKey'],
  },
};

export function listSourceTypes() {
  return Object.values(SOURCES);
}

export function getSourceType(id) {
  return SOURCES[id] || null;
}

/**
 * Minimal health check for a source.
 * Returns { ok, error?, at }
 */
export async function testSource(type, config = {}) {
  const at = new Date().toISOString();
  try {
    if (type === 'dramabox') {
      // Dramabox health is handled by the existing provider; this is a lightweight check.
      return { ok: true, at, note: 'Use the proxy test for full Dramabox verification' };
    }
    if (type === 'dramabos') {
      if (!config.apiKey) return { ok: false, error: 'API key required', at };
      const res = await fetch('https://dramabos.live/dramabox/api/v1/search?keyword=test&page=1', {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'LocalDrama/0.1',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 80)}` : ''}`, at };
      }
      const data = await res.json();
      if (!data.status) return { ok: false, error: data.message || 'API returned status false', at };
      return { ok: true, at };
    }
    return { ok: false, error: 'Unknown source type', at };
  } catch (err) {
    return { ok: false, error: err.message || String(err), at };
  }
}
