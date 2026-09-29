import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';
import { HttpError } from './util.js';

export const ROLES = ['admin', 'manager', 'cashier', 'scanner'];

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '12h' });
}

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active, last_login_at: u.last_login_at, created_at: u.created_at };
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Not signed in'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    // Re-read the user so role changes and deactivation take effect immediately.
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.active) return next(new HttpError(401, 'Account is inactive'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'));
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Not signed in'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission to do that'));
  next();
};

export const MANAGE = ['admin', 'manager'];
export const SELL = ['admin', 'manager', 'cashier'];
export const SCAN = ['admin', 'manager', 'scanner'];
