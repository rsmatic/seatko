import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';
import { ROLES, publicUser, requireRole } from '../auth.js';
import { h, str, oneOf, bad, notFound, updateSet } from '../util.js';

const r = Router();
r.use(requireRole('admin'));

const activeAdmins = (orgId) => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1 AND org_id = ?").get(orgId).n;
const orgUser = (id, orgId) => db.prepare('SELECT * FROM users WHERE id = ? AND org_id = ?').get(id, orgId);

r.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY created_at DESC').all(req.orgId).map(publicUser));
});

r.post('/', h((req, res) => {
  const name = str(req.body.name, 'Name', { required: true, max: 100 });
  const email = str(req.body.email, 'Email', { required: true, max: 200 });
  const password = str(req.body.password, 'Password', { required: true, max: 200 });
  const role = oneOf(req.body.role, 'Role', ROLES, { required: true });
  if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Email looks invalid');
  if (password.length < 8) throw bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw bad('A user with that email already exists');
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(req.orgId, name, email, bcrypt.hashSync(password, 10), role);
  audit(req, 'create', 'user', lastInsertRowid, { email, role });
  res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid)));
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
  if (sql) db.prepare(`UPDATE users SET ${sql} WHERE id = @id`).run({ ...params, id: user.id });
  audit(req, 'update', 'user', user.id, { ...params, password_reset: !!password });
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)));
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
