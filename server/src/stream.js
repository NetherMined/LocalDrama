import fs from 'node:fs';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { httpError } from './errors.js';

async function* throttled(filePath, start, end, bytesPerSec) {
  const handle = await fs.promises.open(filePath, 'r');
  const step = Math.max(1, Math.floor(bytesPerSec / 10));
  try {
    let pos = start;
    while (pos <= end) {
      const len = Math.min(step, end - pos + 1);
      const buf = Buffer.alloc(len);
      const { bytesRead } = await handle.read(buf, 0, len, pos);
      if (bytesRead === 0) break;
      pos += bytesRead;
      yield buf.subarray(0, bytesRead);
      await sleep(100);
    }
  } finally {
    await handle.close();
  }
}

function openSlice(filePath, start, end, bytesPerSec) {
  if (!bytesPerSec) return fs.createReadStream(filePath, { start, end });
  return Readable.from(throttled(filePath, start, end, bytesPerSec), { objectMode: false });
}

export async function sendRanged(req, reply, filePath, { bytesPerSec = 0 } = {}) {
  let size;
  try {
    ({ size } = await fs.promises.stat(filePath));
  } catch {
    throw httpError(404, 'File not found');
  }

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', 'video/mp4');

  const unsatisfiable = () => reply.code(416).header('Content-Range', `bytes */${size}`).send();

  const header = req.headers.range;
  if (!header) {
    reply.header('Content-Length', size);
    if (size === 0) return reply.send('');
    return reply.send(openSlice(filePath, 0, size - 1, bytesPerSec));
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return unsatisfiable();

  let start;
  let end;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix <= 0) return unsatisfiable();
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }

  if (size === 0 || start >= size || start > end) return unsatisfiable();

  reply.code(206);
  reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
  reply.header('Content-Length', end - start + 1);
  return reply.send(openSlice(filePath, start, end, bytesPerSec));
}
