export function createEvents() {
  const clients = new Set();

  const keepAlive = setInterval(() => {
    for (const res of clients) res.write(': keep-alive\n\n');
  }, 25000);
  keepAlive.unref();

  return {
    emit(event, data) {
      const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(chunk);
    },

    subscribe(req, reply) {
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      clients.add(res);
      const drop = () => clients.delete(res);
      req.raw.on('close', drop);
      res.on('error', drop);
    },
  };
}
