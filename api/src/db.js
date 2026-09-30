import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','manager','cashier','scanner')),
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  artist        TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  venue         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  starts_at     TEXT NOT NULL,
  doors_at      TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','on_sale','sold_out','closed','cancelled')),
  poster        TEXT,
  max_per_order INTEGER NOT NULL DEFAULT 10,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tiers (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  color       TEXT NOT NULL DEFAULT '#d4a24c',
  kind        TEXT NOT NULL DEFAULT 'seated' CHECK (kind IN ('seated','ga')),
  capacity    INTEGER,
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sections (
  id            INTEGER PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  tier_id       INTEGER REFERENCES tiers(id) ON DELETE SET NULL,
  rows          INTEGER NOT NULL,
  seats_per_row INTEGER NOT NULL,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS seats (
  id         INTEGER PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  row_label  TEXT NOT NULL,
  row_index  INTEGER NOT NULL,
  number     INTEGER NOT NULL,
  tier_id    INTEGER REFERENCES tiers(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','blocked','sold')),
  UNIQUE (section_id, row_label, number)
);
CREATE INDEX IF NOT EXISTS idx_seats_event ON seats(event_id);

CREATE TABLE IF NOT EXISTS promo_codes (
  id         INTEGER PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code       TEXT NOT NULL COLLATE NOCASE,
  kind       TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value      INTEGER NOT NULL CHECK (value >= 0),
  max_uses   INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reference      TEXT NOT NULL UNIQUE,
  buyer_name     TEXT NOT NULL,
  buyer_email    TEXT NOT NULL DEFAULT '',
  buyer_phone    TEXT NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  payment_ref    TEXT NOT NULL DEFAULT '',
  promo_code_id  INTEGER REFERENCES promo_codes(id) ON DELETE SET NULL,
  notes          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded')),
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);

CREATE TABLE IF NOT EXISTS tickets (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id       INTEGER REFERENCES tiers(id) ON DELETE SET NULL,
  seat_id       INTEGER REFERENCES seats(id) ON DELETE SET NULL,
  tier_name     TEXT NOT NULL,
  seat_label    TEXT,
  price_cents   INTEGER NOT NULL,
  holder_name   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','used','void')),
  checked_in_at TEXT,
  checked_in_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  details    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Lightweight migrations for databases created before a column existed.
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
if (!hasColumn('events', 'show_on_website')) {
  db.exec('ALTER TABLE events ADD COLUMN show_on_website INTEGER NOT NULL DEFAULT 1');
}
if (!hasColumn('events', 'logo')) {
  // Optional per-event logo: replaces the default logo on that event's tickets and QR codes.
  db.exec('ALTER TABLE events ADD COLUMN logo TEXT');
}

const DEFAULT_SETTINGS = {
  org_name: 'POIMEN',
  org_tagline: 'A band of pastors · Philippines',
  currency: 'PHP',
  logo: '',
  qr_color: '#111111',
  ticket_accent: '#d4a24c',
  ticket_footer: 'Present this QR code at the entrance. One scan per ticket.',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) {
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    config.admin.name,
    config.admin.email,
    bcrypt.hashSync(config.admin.password, 10),
    'admin',
  );
  console.log(`Created admin account ${config.admin.email}`);
}

export function getSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
}

export function audit(req, action, entity, entityId = null, details = '') {
  db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
    req.user?.id ?? null,
    action,
    entity,
    entityId,
    typeof details === 'string' ? details : JSON.stringify(details),
  );
}
