// Seeds a demo organizer (POIMEN) with a concert, pricing tiers, a seat map and staff accounts.
// Safe to re-run: skips anything that already exists.
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, initOrgSettings } from './db.js';
import { rowLabel } from './util.js';

const ORG = 'POIMEN';
let orgId = db.prepare('SELECT id FROM organizations WHERE name = ?').get(ORG)?.id;
if (!orgId) {
  orgId = db.prepare("INSERT INTO organizations (name, billing_model, fee_per_ticket_cents, free_tickets_per_event) VALUES (?, 'per_ticket', 1000, 50)")
    .run(ORG).lastInsertRowid;
  const logo = `org-${orgId}-logo.jpg`;
  fs.copyFileSync(path.join(config.root, 'assets/poimen-logo.jpg'), path.join(config.uploadDir, logo));
  initOrgSettings(orgId, { org_name: ORG, org_tagline: 'A band of pastors · Philippines', logo });
  console.log(`organizer "${ORG}" created (₱10/ticket after 50 free per event)`);
}

const staff = [
  [config.admin.name, config.admin.email, 'admin', config.admin.password],
  ['Maria Manager', 'manager@seatko.local', 'manager'],
  ['Carlo Cashier', 'cashier@seatko.local', 'cashier'],
  ['Sam Scanner', 'scanner@seatko.local', 'scanner'],
];
for (const [name, email, role, password = 'password123'] of staff) {
  if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    db.prepare('INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(orgId, name, email, bcrypt.hashSync(password, 10), role);
    console.log(`user  ${email} / ${password} (${role})`);
  }
}

const TITLE = 'POIMEN Live: Shepherds in Song';
if (db.prepare('SELECT 1 FROM events WHERE title = ?').get(TITLE)) {
  console.log('Demo event already exists, skipping.');
  process.exit(0);
}

db.transaction(() => {
  const { lastInsertRowid: eventId } = db.prepare(`
    INSERT INTO events (org_id, title, artist, description, venue, address, starts_at, doors_at, status, max_per_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'on_sale', 10)
  `).run(
    orgId,
    TITLE,
    'POIMEN',
    'A night of worship with POIMEN, a band of pastors from different congregations across the Philippines. "Shepherds who lead with the Word, and with song."',
    'To be announced',
    'Philippines',
    '2026-12-20T18:00',
    '2026-12-20T17:00',
  );

  const tier = db.prepare(`
    INSERT INTO tiers (event_id, name, description, price_cents, color, kind, capacity, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const vip = tier.run(eventId, 'VIP', 'Front rows, meet & greet', 250000, '#d4a24c', 'seated', null, 0).lastInsertRowid;
  const gold = tier.run(eventId, 'Gold', 'Center orchestra', 150000, '#c0c7d1', 'seated', null, 1).lastInsertRowid;
  const silver = tier.run(eventId, 'Silver', 'Side and rear seats', 80000, '#7c9cbf', 'seated', null, 2).lastInsertRowid;
  tier.run(eventId, 'General Admission', 'Standing area at the back', 50000, '#8f8f8f', 'ga', 200, 3);

  const section = db.prepare('INSERT INTO sections (event_id, name, tier_id, rows, seats_per_row, sort) VALUES (?, ?, ?, ?, ?, ?)');
  const seat = db.prepare('INSERT INTO seats (event_id, section_id, row_label, row_index, number, tier_id) VALUES (?, ?, ?, ?, ?, ?)');
  const layout = [
    ['Left Wing', silver, 8, 8, () => silver],
    ['Center Orchestra', gold, 10, 16, (r) => (r < 3 ? vip : gold)],
    ['Right Wing', silver, 8, 8, () => silver],
  ];
  layout.forEach(([name, tierId, rows, perRow, tierFor], i) => {
    const { lastInsertRowid: secId } = section.run(eventId, name, tierId, rows, perRow, i);
    for (let r = 0; r < rows; r++) for (let n = 1; n <= perRow; n++) seat.run(eventId, secId, rowLabel(r), r, n, tierFor(r));
  });

  db.prepare("INSERT INTO promo_codes (event_id, code, kind, value, max_uses) VALUES (?, 'SHEPHERD10', 'percent', 10, 100)").run(eventId);
  db.prepare("INSERT INTO promo_codes (event_id, code, kind, value, max_uses) VALUES (?, 'CHURCH200', 'fixed', 20000, 50)").run(eventId);
  console.log(`event "${TITLE}" created with id ${eventId}`);
})();
