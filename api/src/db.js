import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
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
if (!hasColumn('sections', 'pos_x')) {
  // Seat-plan layout: section center in px relative to the stage's center line (NULL = auto-arranged).
  db.exec('ALTER TABLE sections ADD COLUMN pos_x REAL');
  db.exec('ALTER TABLE sections ADD COLUMN pos_y REAL');
  db.exec('ALTER TABLE sections ADD COLUMN angle REAL NOT NULL DEFAULT 0');
}
if (!hasColumn('orders', 'emailed_at')) {
  // Last time the order's tickets were emailed to the buyer, and to which address.
  db.exec('ALTER TABLE orders ADD COLUMN emailed_at TEXT');
  db.exec('ALTER TABLE orders ADD COLUMN emailed_to TEXT');
}
if (!hasColumn('events', 'logo')) {
  // Optional per-event logo: replaces the default logo on that event's tickets and QR codes.
  db.exec('ALTER TABLE events ADD COLUMN logo TEXT');
}

// ---------- multi-organizer (SaaS) ----------
// Each organizer is an organization with its own users, events, settings and billing terms.
// The platform owner (users.is_superadmin = 1, org_id NULL) manages organizations and billing.

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  billing_model          TEXT NOT NULL DEFAULT 'free' CHECK (billing_model IN ('free','per_ticket','subscription','per_event')),
  fee_per_ticket_cents   INTEGER NOT NULL DEFAULT 0,
  fee_percent_bp         INTEGER NOT NULL DEFAULT 0,  -- basis points of ticket sales (250 = 2.5%)
  free_tickets_per_event INTEGER NOT NULL DEFAULT 0,
  monthly_fee_cents      INTEGER NOT NULL DEFAULT 0,
  per_event_fee_cents    INTEGER NOT NULL DEFAULT 0,
  billing_start          TEXT,                         -- YYYY-MM, first billed month for subscriptions
  contact_name           TEXT NOT NULL DEFAULT '',
  contact_email          TEXT NOT NULL DEFAULT '',
  contact_phone          TEXT NOT NULL DEFAULT '',
  notes                  TEXT NOT NULL DEFAULT '',
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS org_settings (
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key    TEXT NOT NULL,
  value  TEXT,
  PRIMARY KEY (org_id, key)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- What an organizer owes. Amounts can be negative (refunded ticket fees, credits).
CREATE TABLE IF NOT EXISTS billing_charges (
  id           INTEGER PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('ticket_fee','ticket_refund','event_fee','subscription','adjustment')),
  description  TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  ref          TEXT,
  event_id     INTEGER REFERENCES events(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_charges_org ON billing_charges(org_id);

-- Payments organizers submit (GCash / bank, with proof); the owner approves or rejects them.
CREATE TABLE IF NOT EXISTS billing_payments (
  id           INTEGER PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method       TEXT NOT NULL,
  reference    TEXT NOT NULL DEFAULT '',
  proof        TEXT,
  note         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note  TEXT NOT NULL DEFAULT '',
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_org ON billing_payments(org_id);
`);

if (!hasColumn('users', 'org_id')) {
  db.exec('ALTER TABLE users ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
  db.exec('ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0');
}
if (!hasColumn('events', 'org_id')) db.exec('ALTER TABLE events ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE');
if (!hasColumn('audit_log', 'org_id')) db.exec('ALTER TABLE audit_log ADD COLUMN org_id INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id)');

// Per-user event access: staff with all_events = 0 only see the events listed in user_events.
// Admins always see every event of their organizer.
if (!hasColumn('users', 'all_events')) db.exec('ALTER TABLE users ADD COLUMN all_events INTEGER NOT NULL DEFAULT 1');
db.exec(`
CREATE TABLE IF NOT EXISTS user_events (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_user_events_event ON user_events(event_id);
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id)');

export const DEFAULT_ORG_SETTINGS = {
  org_name: '',
  org_tagline: '',
  currency: 'PHP',
  logo: '',
  qr_color: '#111111',
  ticket_accent: '#d4a24c',
  ticket_footer: 'Present this QR code at the entrance. One scan per ticket.',
};

export function initOrgSettings(orgId, overrides = {}) {
  const ins = db.prepare('INSERT OR IGNORE INTO org_settings (org_id, key, value) VALUES (?, ?, ?)');
  for (const [k, v] of Object.entries({ ...DEFAULT_ORG_SETTINGS, ...overrides })) ins.run(orgId, k, v);
}

// Single-organizer installs from before multi-organizer support: move everything into one organization.
db.transaction(() => {
  const orphans = db.prepare('SELECT (SELECT COUNT(*) FROM users WHERE org_id IS NULL AND is_superadmin = 0) + (SELECT COUNT(*) FROM events WHERE org_id IS NULL) n').get().n;
  if (!orphans) return;
  const legacy = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  let orgId = db.prepare('SELECT id FROM organizations ORDER BY id LIMIT 1').get()?.id;
  if (!orgId) {
    orgId = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(legacy.org_name || 'My organization').lastInsertRowid;
    // The old single-tenant default logo was POIMEN's; keep it for this organizer.
    if (!legacy.logo) {
      const file = `org-${orgId}-logo.jpg`;
      fs.copyFileSync(path.join(config.root, 'assets/poimen-logo.jpg'), path.join(config.uploadDir, file));
      legacy.logo = file;
    }
    initOrgSettings(orgId, legacy);
  }
  db.prepare('UPDATE users SET org_id = ? WHERE org_id IS NULL AND is_superadmin = 0').run(orgId);
  db.prepare('UPDATE events SET org_id = ? WHERE org_id IS NULL').run(orgId);
  db.prepare('UPDATE audit_log SET org_id = ? WHERE org_id IS NULL').run(orgId);
  console.log(`Moved existing data into organization #${orgId}`);
})();

// Platform owner account.
if (!db.prepare('SELECT 1 FROM users WHERE is_superadmin = 1').get()) {
  let password = config.owner.password;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    const file = path.join(path.dirname(config.dbPath), 'owner-password.txt');
    fs.writeFileSync(file, `${password}\n`, { mode: 0o600 });
    console.log(`Owner password written to ${file}`);
  }
  db.prepare("INSERT INTO users (name, email, password_hash, role, is_superadmin) VALUES (?, ?, ?, 'admin', 1)")
    .run(config.owner.name, config.owner.email, bcrypt.hashSync(password, 10));
  console.log(`Created platform owner account ${config.owner.email}`);
}

const PLATFORM_DEFAULTS = {
  payment_instructions: 'Send your payment via GCash or bank transfer, then submit the reference number and a screenshot here.',
  gcash_name: '',
  gcash_number: '',
  bank_details: '',
};
for (const [k, v] of Object.entries(PLATFORM_DEFAULTS)) {
  db.prepare('INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)').run(k, v);
}

export function getSettings(orgId) {
  const rows = db.prepare('SELECT key, value FROM org_settings WHERE org_id = ?').all(orgId);
  return { ...DEFAULT_ORG_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export function getPlatformSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM platform_settings').all().map((r) => [r.key, r.value]));
}

export function audit(req, action, entity, entityId = null, details = '') {
  db.prepare('INSERT INTO audit_log (user_id, org_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user?.id ?? null,
    req.orgId ?? null,
    action,
    entity,
    entityId,
    typeof details === 'string' ? details : JSON.stringify(details),
  );
}
