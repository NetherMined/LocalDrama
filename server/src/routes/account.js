import { httpError } from '../errors.js';
import { readDeviceId } from '../auth.js';

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid id');
  return id;
}

function parseIds(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 200) throw httpError(400, 'ids must be an array of up to 200 ids');
  return value.map(parseId);
}

export function registerAccountRoutes(app, ctx) {
  const { accounts, auth } = ctx;

  app.get('/api/account', async (req) => ({
    account: req.account,
    unread: accounts.unreadCount(req.account.id),
  }));

  app.post('/api/account/password', async (req) => {
    const body = req.body ?? {};
    return accounts.changePassword(req.account.id, {
      current: body.current,
      next: body.next,
      keepToken: auth.tokenFromRequest(req),
    });
  });

  app.get('/api/account/devices', async (req) => ({
    items: accounts.listDevices(req.account.id, readDeviceId(req)),
  }));

  app.delete('/api/account/devices/:id', async (req) => {
    const deviceId = String(req.params.id);
    return accounts.removeDevice(req.account.id, deviceId);
  });

  app.get('/api/account/notifications', async (req) => ({
    items: accounts.listNotifications(req.account.id),
    unread: accounts.unreadCount(req.account.id),
  }));

  app.post('/api/account/notifications/read', async (req) => {
    const ids = parseIds(req.body?.ids);
    return accounts.markRead(req.account.id, ids);
  });
}
