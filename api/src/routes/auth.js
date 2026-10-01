import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';
import { publicUser, requireAuth, signToken } from '../auth.js';
import { h, str, HttpError, bad } from '../util.js';

const r = Router();

r.post('/login', h((req, res) => {
  const email = str(req.body.email, 'Email', { required: true });
  const password = str(req.body.password, 'Password', { required: true });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new HttpError(401, 'Invalid email or password');
  if (!user.active) throw new HttpError(403, 'This account has been deactivated');
  const org = user.org_id && db.prepare('SELECT status FROM organizations WHERE id = ?').get(user.org_id);
  if (org && org.status !== 'active') throw new HttpError(403, 'This organizer account is suspended. Please contact SeatKo.');
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  req.user = user;
  audit(req, 'login', 'user', user.id);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

r.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

r.post('/password', requireAuth, h((req, res) => {
  const current = str(req.body.currentPassword, 'Current password', { required: true });
  const next = str(req.body.newPassword, 'New password', { required: true, max: 200 });
  if (next.length < 8) throw bad('New password must be at least 8 characters');
  if (!bcrypt.compareSync(current, req.user.password_hash)) throw bad('Current password is incorrect');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id);
  audit(req, 'change_password', 'user', req.user.id);
  res.json({ ok: true });
}));

export default r;
