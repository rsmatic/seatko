import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';
import { ROLES, publicUser, requireRole } from '../auth.js';
import { h, str, oneOf, bad, notFound, updateSet } from '../util.js';

const r = Router();
r.use(requireRole('admin'));

const activeAdmins = (orgId) => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1 AND org_id = ?").get(orgId).n;
const orgUser = (id, orgId) => db.prepare('SELECT * FROM users WHERE id = ? AND org_id = ?').get(id, orgId);

/** User plus which events they can work on (all_events, or the assigned event ids). */
function withAccess(u) {
  const eventIds = db.prepare('SELECT event_id FROM user_events WHERE user_id = ? ORDER BY event_id').all(u.id).map((r) => r.event_id);
  return { ...publicUser(u), all_events: u.role === 'admin' || !!u.all_events, event_ids: eventIds };
}
const loadUser = (id) => withAccess(db.prepare('SELECT * FROM users WHERE id = ?').get(id));

/**
 * Apply event access from the request body: { all_events: bool, event_ids: number[] }.
 * Admins always have every event. Only events of this organizer can be assigned.
 */
function setAccess(req, userId, role) {
  if (req.body.all_events === undefined && req.body.event_ids === undefined && role !== 'admin') return;
  const all = role === 'admin' || req.body.all_events === undefined || !!req.body.all_events;
  const ids = all ? [] : [...new Set((Array.isArray(req.body.event_ids) ? req.body.event_ids : []).map(Number))];
  if (!all && !ids.length) throw bad('Choose at least one event, or give access to all events');
  for (const id of ids) {
    if (!db.prepare('SELECT 1 FROM events WHERE id = ? AND org_id = ?').get(id, req.orgId)) throw bad('Unknown event selected');
  }
  db.prepare('UPDATE users SET all_events = ? WHERE id = ?').run(all ? 1 : 0, userId);
  db.prepare('DELETE FROM user_events WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT INTO user_events (user_id, event_id) VALUES (?, ?)');
  for (const id of ids) ins.run(userId, id);
}

r.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY created_at DESC').all(req.orgId).map(withAccess));
});

r.post('/', h((req, res) => {
  const name = str(req.body.name, 'Name', { required: true, max: 100 });
  const email = str(req.body.email, 'Email', { required: true, max: 200 });
  const password = str(req.body.password, 'Password', { required: true, max: 200 });
  const role = oneOf(req.body.role, 'Role', ROLES, { required: true });
  if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Email looks invalid');
  if (password.length < 8) throw bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw bad('A user with that email already exists');
  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .run(req.orgId, name, email, bcrypt.hashSync(password, 10), role);
    setAccess(req, lastInsertRowid, role);
    return lastInsertRowid;
  })();
  audit(req, 'create', 'user', id, { email, role, all_events: req.body.all_events, event_ids: req.body.event_ids });
  res.status(201).json(loadUser(id));
}));

r.patch('/:id', h((req, res) => {
  const user = orgUser(req.params.id, req.orgId);
  if (!user) throw notFound('User');
  const fields = {
    name: str(req.body.name, 'Name', { max: 100 }),
    email: str(req.body.email, 'Email', { max: 200 }),
    role: oneOf(req.body.role, 'Role', ROLES),
    active: req.body.active === undefined ? undefined : req.body.active ? 1 : 0,
  };
  if (fields.email && fields.email.toLowerCase() !== user.email.toLowerCase() &&
      db.prepare('SELECT 1 FROM users WHERE email = ?').get(fields.email)) throw bad('A user with that email already exists');

  const losingAdmin = user.role === 'admin' && user.active && ((fields.role && fields.role !== 'admin') || fields.active === 0);
  if (losingAdmin && activeAdmins(req.orgId) <= 1) throw bad('There must be at least one active admin');
  if (user.id === req.user.id && fields.active === 0) throw bad('You cannot deactivate your own account');

  const password = str(req.body.password, 'Password', { max: 200 });
  if (password) {
    if (password.length < 8) throw bad('Password must be at least 8 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), user.id);
  }
  const { sql, params } = updateSet(fields);
  db.transaction(() => {
    if (sql) db.prepare(`UPDATE users SET ${sql} WHERE id = @id`).run({ ...params, id: user.id });
    setAccess(req, user.id, fields.role ?? user.role);
  })();
  audit(req, 'update', 'user', user.id, { ...params, password_reset: !!password, all_events: req.body.all_events, event_ids: req.body.event_ids });
  res.json(loadUser(user.id));
}));

r.delete('/:id', h((req, res) => {
  const user = orgUser(req.params.id, req.orgId);
  if (!user) throw notFound('User');
  if (user.id === req.user.id) throw bad('You cannot delete your own account');
  if (user.role === 'admin' && user.active && activeAdmins(req.orgId) <= 1) throw bad('There must be at least one active admin');
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  audit(req, 'delete', 'user', user.id, { email: user.email });
  res.json({ ok: true });
}));

export default r;
