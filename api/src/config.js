import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  root,
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  dbPath: path.resolve(root, process.env.DB_PATH || 'data/seatko.db'),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  defaultLogo: path.resolve(root, 'assets/default-logo.svg'),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  // Platform owner (super-admin). Created on first start if none exists. Without a password set,
  // a random one is generated and written to <data dir>/owner-password.txt.
  owner: {
    email: process.env.OWNER_EMAIL || 'owner@seatko.local',
    password: process.env.OWNER_PASSWORD || '',
    name: process.env.OWNER_NAME || 'SeatKo Owner',
  },
  // Public addresses used in emails: where buyers open tickets, and where images are served from.
  appUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  apiUrl: (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, ''),
  // Outgoing email (ticket emails). Disabled unless SMTP_HOST and SMTP_USER are set.
  // With Gmail, MAIL_FROM must be the Gmail address itself; a display name like "SeatKo" is fine.
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    password: (process.env.SMTP_PASSWORD || '').replace(/\s+/g, ''),
    from: process.env.MAIL_FROM || '',
  },
  // Admin of the demo organizer created by `npm run seed`.
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@seatko.local',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    name: process.env.ADMIN_NAME || 'Administrator',
  },
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
