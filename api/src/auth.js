import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';
import { HttpError } from './util.js';

export const ROLES = ['admin', 'manager', 'cashier', 'scanner'];

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '12h' });
}

export function publicUser(u) {
  const org = u.org_id ? db.prepare('SELECT id, name, status FROM organizations WHERE id = ?').get(u.org_id) : null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active,
    is_superadmin: !!u.is_superadmin, org,
    last_login_at: u.last_login_at, created_at: u.created_at,
  };
}

/**
 * Authenticates the request and resolves the organization it acts on (req.orgId / req.org):
 * a staff member's own organization, or, for the platform owner, the one chosen with the
 * X-Org-Id header (none = platform-level requests only).
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Not signed in'));
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new HttpError(401, 'Session expired, please sign in again'));
  }
  // Re-read the user so role changes and deactivation take effect immediately.
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user || !user.active) return next(new HttpError(401, 'Account is inactive'));
  req.user = user;

  const orgId = user.is_superadmin ? Number(req.headers['x-org-id']) || null : user.org_id;
  if (orgId) {
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
    if (!org) return next(new HttpError(404, 'Organization not found'));
    if (org.status !== 'active' && !user.is_superadmin) {
      return next(new HttpError(403, 'This organizer account is suspended. Please contact SeatKo.'));
    }
    req.orgId = org.id;
    req.org = org;
  }
  next();
}

/** For organizer-scoped routes: the owner must pick an organization first. */
export function requireOrg(req, _res, next) {
  if (!req.orgId) return next(new HttpError(400, 'Select an organization first'));
  next();
}

export function requireSuper(req, _res, next) {
  if (!req.user?.is_superadmin) return next(new HttpError(403, 'Only the SeatKo owner can do that'));
  next();
}

// The platform owner acts as an admin inside whichever organization they open.
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Not signed in'));
  if (!req.user.is_superadmin && !roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission to do that'));
  next();
};

export const MANAGE = ['admin', 'manager'];
export const SELL = ['admin', 'manager', 'cashier'];
export const SCAN = ['admin', 'manager', 'scanner'];
