// Platform owner (SeatKo super-admin): organizers, their billing terms, payments and platform settings.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, audit, initOrgSettings, getPlatformSettings } from '../db.js';
import { publicUser } from '../auth.js';
import { proofPath } from '../upload.js';
import { billingSummary, syncSubscription } from '../billing.js';
import { orgCharges, orgPayments } from './billing.js';
import { h, str, int, oneOf, bad, notFound, updateSet } from '../util.js';

const r = Router();

const MODELS = ['free', 'per_ticket', 'subscription', 'per_event'];

function orgFields(body, creating) {
  const f = {
    name: str(body.name, 'Organization name', { required: creating, max: 120 }),
    status: oneOf(body.status, 'Status', ['active', 'suspended']),
    billing_model: oneOf(body.billing_model, 'Billing model', MODELS),
    fee_per_ticket_cents: int(body.fee_per_ticket_cents, 'Fee per ticket', { min: 0, max: 10_000_000 }),
    fee_percent_bp: int(body.fee_percent_bp, 'Percent fee', { min: 0, max: 5000 }),
    free_tickets_per_event: int(body.free_tickets_per_event, 'Free tickets per event', { min: 0, max: 1_000_000 }),
    monthly_fee_cents: int(body.monthly_fee_cents, 'Monthly fee', { min: 0, max: 100_000_000 }),
    per_event_fee_cents: int(body.per_event_fee_cents, 'Per-event fee', { min: 0, max: 100_000_000 }),
    billing_start: body.billing_start === '' || body.billing_start === null ? null : str(body.billing_start, 'Billing start', { max: 7 }),
    contact_name: str(body.contact_name, 'Contact name', { max: 120 }),
    contact_email: str(body.contact_email, 'Contact email', { max: 200 }),
    contact_phone: str(body.contact_phone, 'Contact phone', { max: 50 }),
    notes: str(body.notes, 'Notes', { max: 2000 }),
  };
  if (f.billing_start && !/^\d{4}-\d{2}$/.test(f.billing_start)) throw bad('Billing start must look like 2026-10');
  return f;
}

function orgRow(id) {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id);
  if (!org) throw notFound('Organization');
  return org;
}

function withStats(org) {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE org_id = @id) AS users,
      (SELECT COUNT(*) FROM events WHERE org_id = @id) AS events,
      (SELECT COUNT(*) FROM tickets WHERE status != 'void' AND event_id IN (SELECT id FROM events WHERE org_id = @id)) AS tickets_sold,
      (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status = 'paid' AND event_id IN (SELECT id FROM events WHERE org_id = @id)) AS sales_cents,
      (SELECT MAX(created_at) FROM orders WHERE event_id IN (SELECT id FROM events WHERE org_id = @id)) AS last_sale_at,
      (SELECT COUNT(*) FROM billing_payments WHERE org_id = @id AND status = 'pending') AS pending_payments
  `).get({ id: org.id });
  return { ...org, ...stats, billing: billingSummary(org.id) };
}

// ---------- overview ----------

r.get('/overview', (_req, res) => {
  const orgs = db.prepare('SELECT * FROM organizations').all();
  orgs.forEach(syncSubscription);
  res.json({
    organizations: orgs.length,
    active: orgs.filter((o) => o.status === 'active').length,
    outstanding_cents: orgs.reduce((a, o) => a + Math.max(0, billingSummary(o.id).balance_cents), 0),
    collected_cents: db.prepare("SELECT COALESCE(SUM(amount_cents), 0) n FROM billing_payments WHERE status = 'approved'").get().n,
    collected_month_cents: db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) n FROM billing_payments
      WHERE status = 'approved' AND strftime('%Y-%m', reviewed_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
    `).get().n,
    pending_payments: db.prepare("SELECT COUNT(*) n FROM billing_payments WHERE status = 'pending'").get().n,
  });
});

// ---------- organizations ----------

r.get('/organizations', (_req, res) => {
  res.json(db.prepare('SELECT * FROM organizations ORDER BY name COLLATE NOCASE').all().map(withStats));
});

r.post('/organizations', h((req, res) => {
  const f = orgFields(req.body, true);
  const admin = req.body.admin || {};
  const adminName = str(admin.name, 'Admin name', { required: true, max: 100 });
  const adminEmail = str(admin.email, 'Admin email', { required: true, max: 200 });
  const adminPassword = str(admin.password, 'Admin password', { required: true, max: 200 });
  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) throw bad('Admin email looks invalid');
  if (adminPassword.length < 8) throw bad('Admin password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail)) throw bad('A user with that email already exists');

  const id = db.transaction(() => {
    const cols = Object.entries(f).filter(([, v]) => v !== undefined);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO organizations (${cols.map(([k]) => k).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
    `).run(...cols.map(([, v]) => v));
    initOrgSettings(lastInsertRowid, { org_name: f.name });
    db.prepare("INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
      .run(lastInsertRowid, adminName, adminEmail, bcrypt.hashSync(adminPassword, 10));
    return lastInsertRowid;
  })();
  audit(req, 'create', 'organization', id, { name: f.name, admin: adminEmail, billing_model: f.billing_model ?? 'free' });
  res.status(201).json(withStats(orgRow(id)));
}));

r.get('/organizations/:id', h((req, res) => {
  const org = orgRow(req.params.id);
  res.json({
    ...withStats(org),
    users: db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY created_at').all(org.id).map(publicUser),
    charges: orgCharges(org.id),
    payments: orgPayments(org.id),
  });
}));

r.patch('/organizations/:id', h((req, res) => {
  const org = orgRow(req.params.id);
  const { sql, params } = updateSet(orgFields(req.body, false));
  if (sql) db.prepare(`UPDATE organizations SET ${sql} WHERE id = @id`).run({ ...params, id: org.id });
  if (params.name) db.prepare("UPDATE org_settings SET value = ? WHERE org_id = ? AND key = 'org_name' AND value = ?").run(params.name, org.id, org.name);
  audit(req, 'update', 'organization', org.id, params);
  res.json(withStats(orgRow(org.id)));
}));

// Manual charge or credit (negative amount), e.g. a setup fee or a discount.
r.post('/organizations/:id/charges', h((req, res) => {
  const org = orgRow(req.params.id);
  const description = str(req.body.description, 'Description', { required: true, max: 200 });
  const amount = int(req.body.amount_cents, 'Amount', { required: true, min: -100_000_000, max: 100_000_000 });
  if (!amount) throw bad('Amount cannot be zero');
  db.prepare(`
    INSERT INTO billing_charges (org_id, kind, description, amount_cents, created_by) VALUES (?, 'adjustment', ?, ?, ?)
  `).run(org.id, description, amount, req.user.id);
  audit(req, 'adjustment', 'organization', org.id, { description, amount_cents: amount });
  res.status(201).json(billingSummary(org.id));
}));

// Reset an organizer admin's password (they can't reach "forgot password" on their own).
r.post('/users/:id/password', h((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_superadmin = 0').get(req.params.id);
  if (!user) throw notFound('User');
  const password = str(req.body.password, 'Password', { required: true, max: 200 });
  if (password.length < 8) throw bad('Password must be at least 8 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), user.id);
  audit(req, 'reset_password', 'user', user.id, user.email);
  res.json({ ok: true });
}));

// ---------- payments ----------

r.get('/payments', (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  res.json(db.prepare(`
    SELECT p.*, o.name AS org_name, u.name AS created_by_name, rv.name AS reviewed_by_name
    FROM billing_payments p JOIN organizations o ON o.id = p.org_id
    LEFT JOIN users u ON u.id = p.created_by LEFT JOIN users rv ON rv.id = p.reviewed_by
    WHERE (? IS NULL OR p.status = ?) ORDER BY p.id DESC LIMIT 500
  `).all(status, status));
});

function review(status) {
  return h((req, res) => {
    const p = db.prepare('SELECT * FROM billing_payments WHERE id = ?').get(req.params.id);
    if (!p) throw notFound('Payment');
    if (p.status !== 'pending') throw bad(`This payment was already ${p.status}`);
    const note = str(req.body.note, 'Note', { max: 500 }) ?? '';
    db.prepare("UPDATE billing_payments SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?")
      .run(status, note, req.user.id, p.id);
    audit(req, `payment_${status}`, 'billing_payment', p.id, { org: p.org_id, amount_cents: p.amount_cents, note });
    res.json(db.prepare('SELECT * FROM billing_payments WHERE id = ?').get(p.id));
  });
}
r.post('/payments/:id/approve', review('approved'));
r.post('/payments/:id/reject', review('rejected'));

// Owner can also record a payment received directly (cash, etc.); it's approved immediately.
r.post('/organizations/:id/payments', h((req, res) => {
  const org = orgRow(req.params.id);
  const amount = int(req.body.amount_cents, 'Amount', { required: true, min: 1, max: 1_000_000_000 });
  const method = str(req.body.method, 'Method', { required: true, max: 30 });
  const reference = str(req.body.reference, 'Reference', { max: 100 }) ?? '';
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO billing_payments (org_id, amount_cents, method, reference, status, created_by, reviewed_by, reviewed_at, note)
    VALUES (?, ?, ?, ?, 'approved', ?, ?, datetime('now'), 'Recorded by SeatKo')
  `).run(org.id, amount, method, reference, req.user.id, req.user.id);
  audit(req, 'record_payment', 'billing_payment', lastInsertRowid, { org: org.id, amount_cents: amount });
  res.status(201).json(billingSummary(org.id));
}));

r.get('/payments/:id/proof', h((req, res) => {
  const p = db.prepare('SELECT proof FROM billing_payments WHERE id = ?').get(req.params.id);
  if (!p?.proof) throw notFound('Proof');
  res.sendFile(proofPath(p.proof));
}));

// ---------- platform settings (where organizers send payments) ----------

r.get('/settings', (_req, res) => res.json(getPlatformSettings()));

r.put('/settings', h((req, res) => {
  const fields = {
    payment_instructions: str(req.body.payment_instructions, 'Instructions', { max: 2000 }),
    gcash_name: str(req.body.gcash_name, 'GCash name', { max: 100 }),
    gcash_number: str(req.body.gcash_number, 'GCash number', { max: 30 }),
    bank_details: str(req.body.bank_details, 'Bank details', { max: 1000 }),
  };
  const stmt = db.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) stmt.run(k, v);
  audit(req, 'update', 'platform_settings', null, fields);
  res.json(getPlatformSettings());
}));

export default r;
