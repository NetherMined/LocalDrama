import Bonjour from 'bonjour-service';

export function createMdns({ getConfig, port, version, log }) {
  let bonjour = null;
  let advertising = false;

  function stop() {
    if (!bonjour) return;
    try {
      bonjour.destroy();
    } catch {
      // Nothing to clean up if the socket never opened.
    }
    bonjour = null;
    advertising = false;
  }

  function start() {
    if (advertising) return;
    try {
      bonjour ??= new Bonjour({}, (err) => log.warn(`mDNS: ${err.message}`));
      bonjour.publish({ name: 'Dramabox Server', type: 'http', port, txt: { path: '/', version } });
      advertising = true;
      log.info('mDNS: advertising "Dramabox Server"');
    } catch (err) {
      log.warn(`mDNS advertisement unavailable: ${err.message}`);
      stop();
    }
  }

  return {
    sync() {
      if (getConfig().mdns) start();
      else stop();
    },
    shutdown: stop,
  };
}
