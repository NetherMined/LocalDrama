import { httpError } from '../errors.js';
import { createActivity } from '../activity.js';

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid user id');
  return id;
}

export function registerAdminRoutes(app, ctx) {
  const { accounts, profiles, db } = ctx;
  const activity = createActivity({ db, accounts });

  app.get('/api/admin/activity', async (req) => {
    profiles.requireAdmin(req);
    return { items: activity.summary() };
  });

  app.get('/api/admin/users/:id/activity', async (req) => {
    profiles.requireAdmin(req);
    return activity.user(parseId(req.params.id));
  });

  app.get('/api/admin/users', async (req) => {
    profiles.requireAdmin(req);
    return { items: accounts.list() };
  });

  app.post('/api/admin/users', async (req) => {
    const admin = profiles.requireAdmin(req);
    const body = req.body ?? {};
    return accounts.create({ username: body.username, role: body.role, createdBy: admin.id });
  });

  app.patch('/api/admin/users/:id', async (req) => {
    const admin = profiles.requireAdmin(req);
    const id = parseId(req.params.id);
    const body = req.body ?? {};
    let account = null;
    if (body.role !== undefined) account = accounts.setRole(id, body.role, admin.id);
    if (body.disabled !== undefined) account = accounts.setDisabled(id, body.disabled, admin.id);
    if (!account) account = accounts.get(id);
    return { account };
  });

  app.post('/api/admin/users/:id/reset-password', async (req) => {
    const admin = profiles.requireAdmin(req);
    return accounts.resetPassword(parseId(req.params.id), admin.id);
  });

  app.delete('/api/admin/users/:id', async (req) => {
    const admin = profiles.requireAdmin(req);
    return accounts.remove(parseId(req.params.id), admin.id);
  });
}
