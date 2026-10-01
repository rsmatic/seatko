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
