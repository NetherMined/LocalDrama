// Jellyfin and Plex integrations removed.
export function createIntegrations() {
  return {
    lastResult() { return null; },
    notifyDownloadComplete() {},
    refreshNow() { return { ok: false, error: 'Integrations removed' }; },
    test() { return { ok: false, error: 'Integrations removed' }; },
  };
}
