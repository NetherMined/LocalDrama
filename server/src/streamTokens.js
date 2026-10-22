import crypto from 'node:crypto';

const STREAM_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

// Ties /api/hls requests to a stream URL the server handed out, so the proxy can't be used
// to fetch arbitrary upstream playlists. Stream tokens only need to survive the process: the
// player asks for a new stream URL after a restart.
export function createStreamTokens() {
  const streamSecret = crypto.randomBytes(32);

  function sign(payload) {
    return crypto.createHmac('sha256', streamSecret).update(payload).digest('base64url');
  }

  function streamToken(accountId) {
    const payload = `${accountId}.${Date.now() + STREAM_TOKEN_TTL_MS}`;
    return `${payload}.${sign(payload)}`;
  }

  function checkStreamToken(token, accountId) {
    const [id, exp, sig] = String(token || '').split('.');
    if (!sig || Number(id) !== accountId || !(Number(exp) > Date.now())) return false;
    const expected = Buffer.from(sign(`${id}.${exp}`));
    const actual = Buffer.from(sig);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  return { streamToken, checkStreamToken };
}
