// Online ticket requests: buyers submit them from an organizer's website (with proof of payment);
// staff review them, and approving assigns seats, issues the tickets and emails them.
import { Router } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import { db, audit, getSettings } from '../db.js';
import { SELL, requireRole } from '../auth.js';
import { eventFor, tierSummary } from '../services.js';
import { uploadProof, proofPath } from '../upload.js';
import { isEmail, sendMail, requestReceivedEmail, requestRejectedEmail } from '../mailer.js';
import { pushToSheet } from '../sheets.js';
import { createOrder, emailOrder, loadOrder, orgReplyTo } from './sales.js';
import { h, str, oneOf, bad, notFound, randomCode, HttpError } from '../util.js';

export const REQUEST_METHODS = ['gcash', 'maya', 'bank_transfer', 'other'];

export const requestsEnabled = (orgId) => getSettings(orgId).online_requests !== '0';

// ---------- public: submit a request ----------

export const publicRequests = Router();
publicRequests.use(cors());

// Simple in-memory limit per visitor: 5 requests per 10 minutes.
const recent = new Map();
function rateLimit(req) {
  const now = Date.now();
  const hits = (recent.get(req.ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= 5) throw new HttpError(429, 'Too many requests. Please wait a few minutes and try again.');
  hits.push(now);
  recent.set(req.ip, hits);
  if (recent.size > 5000) recent.clear();
}

publicRequests.post('/events/:id/requests', uploadProof.single('proof'), h(async (req, res) => {
  try {
    rateLimit(req);
    if (req.body.website) throw bad('Request rejected'); // honeypot field, invisible to people

    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    const org = ev && db.prepare('SELECT * FROM organizations WHERE id = ?').get(ev.org_id);
    if (!ev || !ev.show_on_website || org?.status !== 'active') throw notFound('Event');
    if (ev.status !== 'on_sale') throw bad('Tickets for this event are not on sale right now');
    if (!requestsEnabled(ev.org_id)) throw bad('Online ticket requests are not available for this event');

    const name = str(req.body.buyer_name, 'Name', { required: true, max: 200 });
    const email = str(req.body.buyer_email, 'Email', { required: true, max: 200 });
    if (!isEmail(email)) throw bad('Please enter a valid email address');
    const phone = str(req.body.buyer_phone, 'Phone number', { required: true, max: 50 });
    const method = oneOf(req.body.payment_method, 'Payment method', REQUEST_METHODS, { required: true });
    const paymentRef = str(req.body.payment_ref, 'Reference number', { max: 100 }) ?? '';
    const note = str(req.body.note, 'Note', { max: 500 }) ?? '';
    if (!req.file) throw bad('Please upload a screenshot or photo of your payment');

    let wanted;
    try { wanted = JSON.parse(req.body.items || '[]'); } catch { wanted = null; }
    if (!Array.isArray(wanted)) throw bad('Choose your tickets');
    const tiers = new Map(tierSummary(ev.id).map((t) => [t.id, t]));
    const items = [];
    for (const w of wanted) {
      const qty = Number(w.qty);
      if (!qty) continue;
      const t = tiers.get(Number(w.tier_id));
      if (!t || !t.active) throw bad('One of the chosen ticket types is not available');
      if (!Number.isInteger(qty) || qty < 0) throw bad('Invalid quantity');
      if (qty > t.total - t.sold) throw bad(`Only ${Math.max(0, t.total - t.sold)} ${t.name} ticket(s) left`);
      items.push({ tier_id: t.id, tier_name: t.name, kind: t.kind, qty, price_cents: t.price_cents });
    }
    const count = items.reduce((a, i) => a + i.qty, 0);
    if (!count) throw bad('Choose at least one ticket');
    if (count > ev.max_per_order) throw bad(`You can request up to ${ev.max_per_order} tickets at a time`);
    const amount = items.reduce((a, i) => a + i.qty * i.price_cents, 0);

    let reference;
    do reference = `REQ-${randomCode(6)}`; while (db.prepare('SELECT 1 FROM ticket_requests WHERE reference = ?').get(reference));
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO ticket_requests (org_id, event_id, reference, buyer_name, buyer_email, buyer_phone, payment_method, payment_ref, items, amount_cents, proof, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ev.org_id, ev.id, reference, name, email, phone, method, paymentRef, JSON.stringify(items), amount, req.file.filename, note);
    req.orgId = ev.org_id;
    audit(req, 'request_received', 'ticket_request', id, { reference, event: ev.id, tickets: count, amount_cents: amount });

    const request = db.prepare('SELECT * FROM ticket_requests WHERE id = ?').get(id);
    sendMail({ to: email, replyTo: orgReplyTo(ev.org_id), ...requestReceivedEmail({ request, event: ev, org: getSettings(ev.org_id) }) })
      .catch((e) => console.error(`request ${reference}: confirmation email failed:`, e.message));
    pushToSheet(id);
    res.status(201).json({ reference, amount_cents: amount, email });
  } catch (e) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw e;
  }
}));

// ---------- staff: review requests ----------

export const staffRequests = Router();

function loadRequest(req, id) {
  const r = db.prepare(`
    SELECT q.*, e.title AS event_title, u.name AS reviewed_by_name, o.reference AS order_reference
    FROM ticket_requests q JOIN events e ON e.id = q.event_id
    LEFT JOIN users u ON u.id = q.reviewed_by LEFT JOIN orders o ON o.id = q.order_id
    WHERE q.id = ? AND q.org_id = ?
  `).get(id, req.orgId);
  if (!r) throw notFound('Request');
  eventFor(req, r.event_id); // the user must be allowed to work on this event
  return { ...r, items: JSON.parse(r.items) };
}

staffRequests.get('/events/:id/requests', requireRole(...SELL), h((req, res) => {
  const ev = eventFor(req, req.params.id);
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const rows = db.prepare(`
    SELECT q.*, u.name AS reviewed_by_name, o.reference AS order_reference
    FROM ticket_requests q LEFT JOIN users u ON u.id = q.reviewed_by LEFT JOIN orders o ON o.id = q.order_id
    WHERE q.event_id = ? AND (? IS NULL OR q.status = ?)
    ORDER BY CASE q.status WHEN 'pending' THEN 0 ELSE 1 END, q.id DESC LIMIT 500
  `).all(ev.id, status, status);
  res.json(rows.map((r) => ({ ...r, items: JSON.parse(r.items) })));
}));

staffRequests.get('/requests/:id', requireRole(...SELL), h((req, res) => res.json(loadRequest(req, req.params.id))));

staffRequests.get('/requests/:id/proof', requireRole(...SELL), h((req, res) => {
  const r = loadRequest(req, req.params.id);
  if (!r.proof) throw notFound('Proof');
  res.sendFile(proofPath(r.proof));
}));

// Approve: issue tickets for the seats/GA chosen by staff, then email them to the buyer.
staffRequests.post('/requests/:id/approve', requireRole(...SELL), h(async (req, res) => {
  const r = loadRequest(req, req.params.id);
  if (r.status !== 'pending') throw bad(`This request was already ${r.status}`);
  const ev = eventFor(req, r.event_id);
  const orderId = db.transaction(() => {
    if (db.prepare('SELECT status FROM ticket_requests WHERE id = ?').get(r.id).status !== 'pending') throw bad('This request was just handled by someone else');
    const id = createOrder(req, ev, {
      seat_ids: req.body.seat_ids, ga: req.body.ga,
      buyer_name: r.buyer_name, buyer_email: r.buyer_email, buyer_phone: r.buyer_phone,
      payment_method: r.payment_method, payment_ref: r.payment_ref,
      notes: [`Online request ${r.reference}`, r.note].filter(Boolean).join(' · '),
    });
    db.prepare(`
      UPDATE ticket_requests SET status = 'approved', order_id = ?, review_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
    `).run(id, str(req.body.note, 'Note', { max: 500 }) ?? '', req.user.id, r.id);
    return id;
  })();
  audit(req, 'request_approved', 'ticket_request', r.id, { reference: r.reference, order: orderId });

  let emailError = null;
  if (req.body.send_email !== false) {
    try {
      await emailOrder(req, loadOrder(orderId, req.orgId, req.user), r.buyer_email);
    } catch (e) {
      emailError = e.message;
    }
  }
  pushToSheet(r.id);
  res.json({ request: loadRequest(req, r.id), order: loadOrder(orderId, req.orgId, req.user), email_error: emailError });
}));

staffRequests.post('/requests/:id/reject', requireRole(...SELL), h(async (req, res) => {
  const r = loadRequest(req, req.params.id);
  if (r.status !== 'pending') throw bad(`This request was already ${r.status}`);
  const reason = str(req.body.note, 'Reason', { max: 500 }) ?? '';
  const changed = db.prepare(`
    UPDATE ticket_requests SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ? AND status = 'pending'
  `).run(reason, req.user.id, r.id).changes;
  if (!changed) throw bad('This request was just handled by someone else');
  audit(req, 'request_rejected', 'ticket_request', r.id, { reference: r.reference, reason });

  let emailError = null;
  if (req.body.send_email !== false) {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(r.event_id);
    const request = db.prepare('SELECT * FROM ticket_requests WHERE id = ?').get(r.id);
    try {
      await sendMail({ to: r.buyer_email, replyTo: orgReplyTo(req.orgId), ...requestRejectedEmail({ request, event, org: getSettings(req.orgId), reason }) });
    } catch (e) {
      emailError = e.message;
    }
  }
  pushToSheet(r.id);
  res.json({ request: loadRequest(req, r.id), email_error: emailError });
}));
