import { Router } from 'express';
import { db, audit } from '../db.js';
import { MANAGE, SCAN, SELL, requireRole } from '../auth.js';
import { getEvent, refreshSoldOut } from '../services.js';
import { chargeTicketFees, refundTicketFees } from '../billing.js';
import { h, str, int, oneOf, bad, notFound, ticketCode, orderRef, csvEscape, HttpError } from '../util.js';

const r = Router();

export const PAYMENT_METHODS = ['cash', 'gcash', 'maya', 'bank_transfer', 'card', 'comp', 'other'];

/**
 * Validate a cart against current inventory and price it.
 * Pure read: safe for quotes; the order route re-runs it inside a transaction.
 */
function priceCart(ev, body, user) {
  const seatIds = Array.isArray(body.seat_ids) ? [...new Set(body.seat_ids.map(Number))] : [];
  const ga = Array.isArray(body.ga) ? body.ga : [];
  const items = [];

  for (const seatId of seatIds) {
    const seat = db.prepare(`
      SELECT s.*, sec.name AS section_name, t.name AS tier_name, t.price_cents, t.active AS tier_active
      FROM seats s JOIN sections sec ON sec.id = s.section_id LEFT JOIN tiers t ON t.id = s.tier_id
      WHERE s.id = ? AND s.event_id = ?
    `).get(seatId, ev.id);
    const label = seat ? `${seat.section_name} · Row ${seat.row_label} · Seat ${seat.number}` : `#${seatId}`;
    if (!seat) throw bad(`Seat ${label} does not belong to this event`);
    if (seat.status !== 'available') throw new HttpError(409, `${label} is no longer available`);
    if (!seat.tier_id || !seat.tier_active) throw bad(`${label} has no active price tier`);
    items.push({ tier_id: seat.tier_id, tier_name: seat.tier_name, price_cents: seat.price_cents, seat_id: seat.id, seat_label: label });
  }

  for (const line of ga) {
    const qty = int(line.qty, 'Quantity', { required: true, min: 0, max: 1000 });
    if (!qty) continue;
    const tier = db.prepare('SELECT * FROM tiers WHERE id = ? AND event_id = ?').get(line.tier_id, ev.id);
    if (!tier || tier.kind !== 'ga') throw bad('Unknown general admission tier');
    if (!tier.active) throw bad(`${tier.name} is not on sale`);
    const sold = db.prepare("SELECT COUNT(*) n FROM tickets WHERE tier_id = ? AND status != 'void'").get(tier.id).n;
    if (sold + qty > tier.capacity) throw new HttpError(409, `Only ${Math.max(0, tier.capacity - sold)} ${tier.name} ticket(s) left`);
    for (let i = 0; i < qty; i++) items.push({ tier_id: tier.id, tier_name: tier.name, price_cents: tier.price_cents, seat_id: null, seat_label: null });
  }

  if (!items.length) throw bad('Add at least one seat or ticket');
  if (!MANAGE.includes(user.role) && items.length > ev.max_per_order) {
    throw bad(`Maximum of ${ev.max_per_order} tickets per order`);
  }

  const subtotal = items.reduce((a, i) => a + i.price_cents, 0);
  const method = body.payment_method;
  let discount = 0;
  let promo = null;

  if (method === 'comp') {
    discount = subtotal;
  } else if (body.promo_code) {
    promo = db.prepare('SELECT * FROM promo_codes WHERE event_id = ? AND code = ?').get(ev.id, String(body.promo_code).trim());
    if (!promo || !promo.active) throw bad('Promo code is not valid');
    if (promo.expires_at && Date.parse(promo.expires_at) < Date.now()) throw bad('Promo code has expired');
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) throw bad('Promo code has been fully used');
    discount = promo.kind === 'percent' ? Math.round((subtotal * promo.value) / 100) : Math.min(promo.value, subtotal);
  }

  return { items, subtotal_cents: subtotal, discount_cents: discount, total_cents: subtotal - discount, promo };
}

function assertSellable(ev, method) {
  if (ev.status === 'cancelled' || ev.status === 'closed') throw bad(`Sales are closed for this event (${ev.status})`);
  if (ev.status === 'draft' && method !== 'comp') throw bad('Event is still a draft. Put it on sale first (complimentary tickets are allowed).');
}

r.post('/events/:id/quote', requireRole(...SELL), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const q = priceCart(ev, req.body, req.user);
  res.json({ ...q, promo: q.promo && { code: q.promo.code, kind: q.promo.kind, value: q.promo.value } });
}));

r.post('/events/:id/orders', requireRole(...SELL), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const buyerName = str(req.body.buyer_name, 'Buyer name', { required: true, max: 200 });
  const buyerEmail = str(req.body.buyer_email, 'Buyer email', { max: 200 }) ?? '';
  const buyerPhone = str(req.body.buyer_phone, 'Buyer phone', { max: 50 }) ?? '';
  const method = oneOf(req.body.payment_method, 'Payment method', PAYMENT_METHODS, { required: true });
  const paymentRef = str(req.body.payment_ref, 'Payment reference', { max: 200 }) ?? '';
  const notes = str(req.body.notes, 'Notes', { max: 1000 }) ?? '';
  const holders = Array.isArray(req.body.holder_names) ? req.body.holder_names : [];
  if (method === 'comp' && !MANAGE.includes(req.user.role)) throw new HttpError(403, 'Only managers can issue complimentary tickets');
  assertSellable(ev, method);

  const orderId = db.transaction(() => {
    const cart = priceCart(ev, req.body, req.user);
    let ref;
    do ref = orderRef(); while (db.prepare('SELECT 1 FROM orders WHERE reference = ?').get(ref));

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO orders (event_id, reference, buyer_name, buyer_email, buyer_phone, subtotal_cents, discount_cents, total_cents,
                          payment_method, payment_ref, promo_code_id, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ev.id, ref, buyerName, buyerEmail, buyerPhone, cart.subtotal_cents, cart.discount_cents, cart.total_cents,
      method, paymentRef, cart.promo?.id ?? null, notes, req.user.id);

    const markSold = db.prepare("UPDATE seats SET status = 'sold' WHERE id = ? AND status = 'available'");
    const insertTicket = db.prepare(`
      INSERT INTO tickets (code, order_id, event_id, tier_id, seat_id, tier_name, seat_label, price_cents, holder_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    cart.items.forEach((item, i) => {
      if (item.seat_id && markSold.run(item.seat_id).changes !== 1) throw new HttpError(409, `${item.seat_label} was just taken`);
      let code;
      do code = ticketCode(); while (db.prepare('SELECT 1 FROM tickets WHERE code = ?').get(code));
      const holder = str(holders[i], 'Holder name', { max: 200 }) || buyerName;
      insertTicket.run(code, lastInsertRowid, ev.id, item.tier_id, item.seat_id, item.tier_name, item.seat_label, item.price_cents, holder);
    });
    if (cart.promo) db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(cart.promo.id);
    chargeTicketFees(req.org, { id: lastInsertRowid, event_id: ev.id, reference: ref, payment_method: method, total_cents: cart.total_cents });
    return lastInsertRowid;
  })();

  refreshSoldOut(ev.id);
  audit(req, 'sell', 'order', orderId, { event: ev.id });
  res.status(201).json(loadOrder(orderId, req.orgId));
}));

function loadOrder(id, orgId) {
  const order = db.prepare(`
    SELECT o.*, u.name AS created_by_name, p.code AS promo_code, e.title AS event_title
    FROM orders o LEFT JOIN users u ON u.id = o.created_by LEFT JOIN promo_codes p ON p.id = o.promo_code_id
    JOIN events e ON e.id = o.event_id
    WHERE o.id = ? AND e.org_id = ?
  `).get(id, orgId);
  if (!order) throw notFound('Order');
  order.tickets = db.prepare('SELECT * FROM tickets WHERE order_id = ? ORDER BY id').all(id);
  return order;
}

r.get('/events/:id/orders', requireRole(...SELL), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const q = req.query.q ? `%${req.query.q}%` : null;
  res.json(db.prepare(`
    SELECT o.*, u.name AS created_by_name,
      (SELECT COUNT(*) FROM tickets k WHERE k.order_id = o.id) AS ticket_count
    FROM orders o LEFT JOIN users u ON u.id = o.created_by
    WHERE o.event_id = ? AND (? IS NULL OR o.reference LIKE ? OR o.buyer_name LIKE ? OR o.buyer_email LIKE ? OR o.buyer_phone LIKE ?)
    ORDER BY o.created_at DESC, o.id DESC LIMIT 500
  `).all(ev.id, q, q, q, q, q));
}));

r.get('/orders/:id', requireRole(...SELL), h((req, res) => res.json(loadOrder(req.params.id, req.orgId))));

function releaseTicket(ticket) {
  db.prepare("UPDATE tickets SET status = 'void' WHERE id = ?").run(ticket.id);
  if (ticket.seat_id) db.prepare("UPDATE seats SET status = 'available' WHERE id = ? AND status = 'sold'").run(ticket.seat_id);
}

r.post('/orders/:id/refund', requireRole(...MANAGE), h((req, res) => {
  const order = loadOrder(req.params.id, req.orgId);
  if (order.status === 'refunded') throw bad('Order is already refunded');
  db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(order.id);
    for (const t of order.tickets) if (t.status !== 'void') releaseTicket(t);
    if (order.promo_code_id) db.prepare('UPDATE promo_codes SET used_count = MAX(0, used_count - 1) WHERE id = ?').run(order.promo_code_id);
    refundTicketFees(req.orgId, order);
  })();
  refreshSoldOut(order.event_id);
  audit(req, 'refund', 'order', order.id, { reference: order.reference, total_cents: order.total_cents, reason: req.body.reason ?? '' });
  res.json(loadOrder(order.id, req.orgId));
}));

// ---------- tickets ----------

const TICKET_SELECT = `
  SELECT k.*, o.reference AS order_reference, o.buyer_name, o.buyer_email, o.buyer_phone, o.payment_method,
         u.name AS checked_in_by_name, t.color AS tier_color
  FROM tickets k JOIN orders o ON o.id = k.order_id
  LEFT JOIN users u ON u.id = k.checked_in_by LEFT JOIN tiers t ON t.id = k.tier_id
`;

const IN_ORG = 'k.event_id IN (SELECT id FROM events WHERE org_id = ?)';

/** A ticket by id, only if it belongs to the organization. */
function orgTicket(id, orgId) {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ? AND event_id IN (SELECT id FROM events WHERE org_id = ?)').get(id, orgId);
  if (!t) throw notFound('Ticket');
  return t;
}

function ticketRows(eventId, { q, status }) {
  const like = q ? `%${q}%` : null;
  return db.prepare(`${TICKET_SELECT}
    WHERE k.event_id = ? AND (? IS NULL OR k.status = ?)
      AND (? IS NULL OR k.code LIKE ? OR k.holder_name LIKE ? OR o.buyer_name LIKE ? OR o.reference LIKE ? OR k.seat_label LIKE ?)
    ORDER BY k.id DESC
  `).all(eventId, status || null, status || null, like, like, like, like, like, like);
}

r.get('/events/:id/tickets', h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  res.json(ticketRows(ev.id, req.query).slice(0, 1000));
}));

r.get('/events/:id/tickets.csv', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  const cols = ['code', 'status', 'tier_name', 'seat_label', 'price_cents', 'holder_name', 'order_reference', 'buyer_name',
    'buyer_email', 'buyer_phone', 'payment_method', 'created_at', 'checked_in_at', 'checked_in_by_name'];
  const lines = [cols.join(',')];
  for (const row of ticketRows(ev.id, req.query)) {
    lines.push(cols.map((c) => csvEscape(c === 'price_cents' ? (row[c] / 100).toFixed(2) : row[c])).join(','));
  }
  const safe = ev.title.replace(/[^\w-]+/g, '_').slice(0, 50);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}-attendees.csv"`);
  res.send('﻿' + lines.join('\r\n'));
}));

r.get('/tickets/:code', h((req, res) => {
  const t = db.prepare(`${TICKET_SELECT} WHERE k.code = ? AND ${IN_ORG}`).get(req.params.code.toUpperCase(), req.orgId);
  if (!t) throw notFound('Ticket');
  res.json(t);
}));

r.patch('/tickets/:id', requireRole(...SELL), h((req, res) => {
  const t = orgTicket(req.params.id, req.orgId);
  const holder = str(req.body.holder_name, 'Holder name', { required: true, max: 200 });
  db.prepare('UPDATE tickets SET holder_name = ? WHERE id = ?').run(holder, t.id);
  audit(req, 'rename', 'ticket', t.id, { from: t.holder_name, to: holder });
  res.json(db.prepare(`${TICKET_SELECT} WHERE k.id = ?`).get(t.id));
}));

r.post('/tickets/:id/void', requireRole(...MANAGE), h((req, res) => {
  const t = orgTicket(req.params.id, req.orgId);
  if (t.status === 'void') throw bad('Ticket is already void');
  db.transaction(() => releaseTicket(t))();
  refreshSoldOut(t.event_id);
  audit(req, 'void', 'ticket', t.id, { code: t.code, reason: req.body.reason ?? '' });
  res.json(db.prepare(`${TICKET_SELECT} WHERE k.id = ?`).get(t.id));
}));

r.post('/tickets/:id/undo-checkin', requireRole(...MANAGE), h((req, res) => {
  const t = orgTicket(req.params.id, req.orgId);
  if (t.status !== 'used') throw bad('Ticket has not been checked in');
  db.prepare("UPDATE tickets SET status = 'valid', checked_in_at = NULL, checked_in_by = NULL WHERE id = ?").run(t.id);
  audit(req, 'undo_checkin', 'ticket', t.id, t.code);
  res.json(db.prepare(`${TICKET_SELECT} WHERE k.id = ?`).get(t.id));
}));

// ---------- check-in ----------

/** Accept a raw code, or a URL / prefixed payload that ends with the code. */
function extractCode(raw) {
  const s = String(raw || '').trim().toUpperCase();
  const m = s.match(/([2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4})\s*$/);
  return m ? m[1] : s;
}

r.post('/checkin', requireRole(...SCAN), h((req, res) => {
  const code = extractCode(req.body.code);
  const eventId = getEvent(int(req.body.event_id, 'Event', { required: true }), req.orgId).id;
  // Tickets of other organizers are reported as unknown.
  const t = db.prepare(`${TICKET_SELECT} WHERE k.code = ? AND ${IN_ORG}`).get(code, req.orgId);
  if (!t) return res.json({ result: 'not_found', message: 'No ticket with this code', code });
  if (t.event_id !== eventId) {
    const other = db.prepare('SELECT title FROM events WHERE id = ?').get(t.event_id);
    return res.json({ result: 'wrong_event', message: `Ticket is for another event: ${other?.title}`, ticket: t });
  }
  if (t.status === 'void') return res.json({ result: 'void', message: 'Ticket has been voided / refunded', ticket: t });
  if (t.status === 'used') {
    return res.json({ result: 'already_used', message: `Already checked in at ${t.checked_in_at} by ${t.checked_in_by_name ?? 'unknown'}`, ticket: t });
  }
  const changed = db.prepare(`
    UPDATE tickets SET status = 'used', checked_in_at = datetime('now'), checked_in_by = ? WHERE id = ? AND status = 'valid'
  `).run(req.user.id, t.id).changes;
  if (!changed) return res.json({ result: 'already_used', message: 'Already checked in', ticket: t });
  audit(req, 'checkin', 'ticket', t.id, t.code);
  res.json({ result: 'ok', message: 'Welcome in!', ticket: db.prepare(`${TICKET_SELECT} WHERE k.id = ?`).get(t.id) });
}));

r.get('/events/:id/checkins', requireRole(...SCAN), h((req, res) => {
  const ev = getEvent(req.params.id, req.orgId);
  res.json(db.prepare(`${TICKET_SELECT} WHERE k.event_id = ? AND k.status = 'used' ORDER BY k.checked_in_at DESC LIMIT 50`).all(ev.id));
}));

export default r;
