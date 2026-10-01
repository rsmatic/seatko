import { Router } from 'express';
import fs from 'node:fs';
import { db, audit } from '../db.js';
import { MANAGE, requireRole } from '../auth.js';
import { upload, uploadPath } from '../upload.js';
import { getEvent, eventSummary, tierSummary, refreshSoldOut } from '../services.js';
import { chargeEventFee } from '../billing.js';
import { h, str, int, oneOf, color, bad, notFound, updateSet } from '../util.js';

const r = Router();
const STATUSES = ['draft', 'on_sale', 'sold_out', 'closed', 'cancelled'];

const withSummary = (ev) => ({ ...ev, summary: eventSummary(ev.id) });

function isoDate(v, field, opts) {
  const s = str(v, field, opts);
  if (s === undefined || s === '') return s === '' ? null : undefined;
  if (Number.isNaN(Date.parse(s))) throw bad(`${field} must be a valid date/time`);
  return s;
}

function eventFields(body, creating) {
  return {
    title: str(body.title, 'Title', { required: creating, max: 200 }),
    artist: str(body.artist, 'Artist', { max: 200 }),
    description: str(body.description, 'Description', { max: 5000 }),
    venue: str(body.venue, 'Venue', { max: 200 }),
    address: str(body.address, 'Address', { max: 300 }),
    starts_at: isoDate(body.starts_at, 'Start time', { required: creating }),
    doors_at: isoDate(body.doors_at, 'Doors open'),
    status: oneOf(body.status, 'Status', STATUSES),
    max_per_order: int(body.max_per_order, 'Max tickets per order', { min: 1, max: 500 }),
    show_on_website: body.show_on_website === undefined ? undefined : body.show_on_website ? 1 : 0,
  };
}

// ---------- events ----------

r.get('/', (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM events WHERE org_id = ?';
  const params = [req.orgId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (q) { sql += ' AND (title LIKE ? OR artist LIKE ? OR venue LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY starts_at DESC';
  res.json(db.prepare(sql).all(...params).map(withSummary));
});

r.get('/:id', h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  res.json({ ...withSummary(ev), tiers: tierSummary(ev.id) });
}));

r.post('/', requireRole(...MANAGE), h((req, res) => {
  const f = eventFields(req.body, true);
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO events (org_id, title, artist, description, venue, address, starts_at, doors_at, status, max_per_order, show_on_website, created_by)
    VALUES (@org_id, @title, @artist, @description, @venue, @address, @starts_at, @doors_at, @status, @max_per_order, @show_on_website, @created_by)
  `).run({
    ...f,
    artist: f.artist ?? '', description: f.description ?? '', venue: f.venue ?? '', address: f.address ?? '',
    doors_at: f.doors_at ?? null, status: f.status ?? 'draft', max_per_order: f.max_per_order ?? 10,
    show_on_website: f.show_on_website ?? 1, created_by: req.user.id, org_id: req.orgId,
  });
  audit(req, 'create', 'event', lastInsertRowid, f.title);
  if ((f.status ?? 'draft') === 'on_sale') chargeEventFee(req.org, getEvent(lastInsertRowid));
  res.status(201).json(withSummary(getEvent(lastInsertRowid)));
}));

r.patch('/:id', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const { sql, params } = updateSet(eventFields(req.body, false));
  if (sql) db.prepare(`UPDATE events SET ${sql}, updated_at = datetime('now') WHERE id = @id`).run({ ...params, id: ev.id });
  if (params.status === 'on_sale') {
    refreshSoldOut(ev.id);
    chargeEventFee(req.org, ev);
  }
  audit(req, 'update', 'event', ev.id, params);
  res.json(withSummary(getEvent(ev.id)));
}));

r.post('/:id/duplicate', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const copy = db.transaction(() => {
    const { lastInsertRowid: newId } = db.prepare(`
      INSERT INTO events (org_id, title, artist, description, venue, address, starts_at, doors_at, status, max_per_order, show_on_website, poster, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, ?)
    `).run(ev.org_id, `${ev.title} (copy)`, ev.artist, ev.description, ev.venue, ev.address, ev.starts_at, ev.doors_at, ev.max_per_order,
      ev.show_on_website, req.user.id);
    const tierMap = new Map();
    for (const t of db.prepare('SELECT * FROM tiers WHERE event_id = ?').all(ev.id)) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO tiers (event_id, name, description, price_cents, color, kind, capacity, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, t.name, t.description, t.price_cents, t.color, t.kind, t.capacity, t.sort, t.active);
      tierMap.set(t.id, lastInsertRowid);
    }
    for (const s of db.prepare('SELECT * FROM sections WHERE event_id = ?').all(ev.id)) {
      const { lastInsertRowid: secId } = db.prepare(`
        INSERT INTO sections (event_id, name, tier_id, rows, seats_per_row, sort, pos_x, pos_y, angle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, s.name, tierMap.get(s.tier_id) ?? null, s.rows, s.seats_per_row, s.sort, s.pos_x, s.pos_y, s.angle);
      const ins = db.prepare(`
        INSERT INTO seats (event_id, section_id, row_label, row_index, number, tier_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const seat of db.prepare('SELECT * FROM seats WHERE section_id = ?').all(s.id)) {
        ins.run(newId, secId, seat.row_label, seat.row_index, seat.number, tierMap.get(seat.tier_id) ?? null,
          seat.status === 'blocked' ? 'blocked' : 'available');
      }
    }
    return newId;
  })();
  audit(req, 'duplicate', 'event', copy, { from: ev.id });
  res.status(201).json(withSummary(getEvent(copy)));
}));

r.delete('/:id', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  if (db.prepare('SELECT 1 FROM orders WHERE event_id = ?').get(ev.id)) {
    throw bad('This event already has orders. Set its status to Cancelled instead of deleting it.');
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
  for (const f of [ev.poster, ev.logo]) if (f) fs.rm(uploadPath(f), { force: true }, () => {});
  audit(req, 'delete', 'event', ev.id, ev.title);
  res.json({ ok: true });
}));

r.post('/:id/poster', requireRole(...MANAGE), upload.single('poster'), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  if (!req.file) throw bad('Choose an image file to upload');
  if (ev.poster) fs.rm(uploadPath(ev.poster), { force: true }, () => {});
  db.prepare("UPDATE events SET poster = ?, updated_at = datetime('now') WHERE id = ?").run(req.file.filename, ev.id);
  audit(req, 'upload_poster', 'event', ev.id);
  res.json(withSummary(getEvent(ev.id)));
}));

// Optional event logo: shown in the middle of this event's QR codes and on its tickets
// instead of the default logo from Branding & settings.
r.post('/:id/logo', requireRole(...MANAGE), upload.single('logo'), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  if (!req.file) throw bad('Choose an image file to upload');
  if (ev.logo) fs.rm(uploadPath(ev.logo), { force: true }, () => {});
  db.prepare("UPDATE events SET logo = ?, updated_at = datetime('now') WHERE id = ?").run(req.file.filename, ev.id);
  audit(req, 'upload_logo', 'event', ev.id, req.file.originalname);
  res.json(withSummary(getEvent(ev.id)));
}));

r.delete('/:id/logo', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  if (ev.logo) fs.rm(uploadPath(ev.logo), { force: true }, () => {});
  db.prepare("UPDATE events SET logo = NULL, updated_at = datetime('now') WHERE id = ?").run(ev.id);
  audit(req, 'remove_logo', 'event', ev.id);
  res.json(withSummary(getEvent(ev.id)));
}));

// ---------- tiers (pricing) ----------

function tierFields(body, creating) {
  const f = {
    name: str(body.name, 'Name', { required: creating, max: 100 }),
    description: str(body.description, 'Description', { max: 500 }),
    price_cents: int(body.price_cents, 'Price', { required: creating, min: 0, max: 100_000_000 }),
    color: color(body.color, 'Color'),
    kind: oneOf(body.kind, 'Kind', ['seated', 'ga']),
    capacity: int(body.capacity, 'Capacity', { min: 0, max: 1_000_000 }),
    sort: int(body.sort, 'Sort', { min: 0, max: 10_000 }),
    active: body.active === undefined ? undefined : body.active ? 1 : 0,
  };
  return f;
}

r.get('/:id/tiers', h((req, res) => res.json(tierSummary(getEvent(req.params.id, req.orgId).id))));

r.post('/:id/tiers', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const f = tierFields(req.body, true);
  const kind = f.kind ?? 'seated';
  if (kind === 'ga' && f.capacity === undefined) throw bad('General admission tiers need a capacity');
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO tiers (event_id, name, description, price_cents, color, kind, capacity, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ev.id, f.name, f.description ?? '', f.price_cents, f.color ?? '#d4a24c', kind, kind === 'ga' ? f.capacity : null,
    f.sort ?? db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 n FROM tiers WHERE event_id = ?').get(ev.id).n);
  audit(req, 'create', 'tier', lastInsertRowid, { event: ev.id, name: f.name, price_cents: f.price_cents });
  refreshSoldOut(ev.id);
  res.status(201).json(tierSummary(ev.id).find((t) => t.id === lastInsertRowid));
}));

r.patch('/:id/tiers/:tierId', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const tier = db.prepare('SELECT * FROM tiers WHERE id = ? AND event_id = ?').get(req.params.tierId, ev.id);
  if (!tier) throw notFound('Tier');
  const f = tierFields(req.body, false);
  const sold = db.prepare("SELECT COUNT(*) n FROM tickets WHERE tier_id = ? AND status != 'void'").get(tier.id).n;
  if (f.kind && f.kind !== tier.kind && sold) throw bad('Cannot change the kind of a tier that already has tickets sold');
  const kind = f.kind ?? tier.kind;
  if (kind === 'ga') {
    f.capacity = f.capacity ?? tier.capacity;
    if (f.capacity === null || f.capacity === undefined) throw bad('General admission tiers need a capacity');
    if (f.capacity < sold) throw bad(`Capacity cannot be lower than tickets already sold (${sold})`);
  } else {
    f.capacity = null;
  }
  const { sql, params } = updateSet(f);
  if (sql) db.prepare(`UPDATE tiers SET ${sql} WHERE id = @id`).run({ ...params, id: tier.id });
  if (kind === 'ga' && tier.kind === 'seated') db.prepare('UPDATE seats SET tier_id = NULL WHERE tier_id = ?').run(tier.id);
  audit(req, 'update', 'tier', tier.id, params);
  refreshSoldOut(ev.id);
  res.json(tierSummary(ev.id).find((t) => t.id === tier.id));
}));

r.delete('/:id/tiers/:tierId', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const tier = db.prepare('SELECT * FROM tiers WHERE id = ? AND event_id = ?').get(req.params.tierId, ev.id);
  if (!tier) throw notFound('Tier');
  if (db.prepare('SELECT 1 FROM tickets WHERE tier_id = ?').get(tier.id)) {
    throw bad('Tickets have been issued for this tier. Deactivate it instead of deleting.');
  }
  db.prepare('DELETE FROM tiers WHERE id = ?').run(tier.id);
  audit(req, 'delete', 'tier', tier.id, tier.name);
  refreshSoldOut(ev.id);
  res.json({ ok: true });
}));

// ---------- promo codes ----------

r.get('/:id/promos', requireRole(...MANAGE, 'cashier'), h((req, res) => {
  res.json(db.prepare('SELECT * FROM promo_codes WHERE event_id = ? ORDER BY id DESC').all(getEvent(req.params.id, req.orgId).id));
}));

function promoFields(body, creating) {
  const f = {
    code: str(body.code, 'Code', { required: creating, max: 40 })?.toUpperCase(),
    kind: oneOf(body.kind, 'Kind', ['percent', 'fixed'], { required: creating }),
    value: int(body.value, 'Value', { required: creating, min: 0, max: 100_000_000 }),
    max_uses: body.max_uses === null || body.max_uses === '' ? null : int(body.max_uses, 'Max uses', { min: 1, max: 1_000_000 }),
    expires_at: isoDate(body.expires_at, 'Expiry'),
    active: body.active === undefined ? undefined : body.active ? 1 : 0,
  };
  if (f.code && !/^[A-Z0-9_-]+$/.test(f.code)) throw bad('Code may only contain letters, numbers, - and _');
  if (f.kind === 'percent' && f.value > 100) throw bad('Percent discount cannot exceed 100');
  return f;
}

r.post('/:id/promos', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const f = promoFields(req.body, true);
  if (db.prepare('SELECT 1 FROM promo_codes WHERE event_id = ? AND code = ?').get(ev.id, f.code)) throw bad('That code already exists for this event');
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO promo_codes (event_id, code, kind, value, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(ev.id, f.code, f.kind, f.value, f.max_uses ?? null, f.expires_at ?? null);
  audit(req, 'create', 'promo', lastInsertRowid, f);
  res.status(201).json(db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(lastInsertRowid));
}));

r.patch('/:id/promos/:promoId', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ? AND event_id = ?').get(req.params.promoId, ev.id);
  if (!promo) throw notFound('Promo code');
  const f = promoFields(req.body, false);
  if ((f.kind ?? promo.kind) === 'percent' && (f.value ?? promo.value) > 100) throw bad('Percent discount cannot exceed 100');
  const { sql, params } = updateSet(f);
  if (sql) db.prepare(`UPDATE promo_codes SET ${sql} WHERE id = @id`).run({ ...params, id: promo.id });
  audit(req, 'update', 'promo', promo.id, params);
  res.json(db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(promo.id));
}));

r.delete('/:id/promos/:promoId', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ? AND event_id = ?').get(req.params.promoId, ev.id);
  if (!promo) throw notFound('Promo code');
  db.prepare('DELETE FROM promo_codes WHERE id = ?').run(promo.id);
  audit(req, 'delete', 'promo', promo.id, promo.code);
  res.json({ ok: true });
}));

export default r;
