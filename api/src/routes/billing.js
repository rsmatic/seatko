// Organizer side of platform billing: see what you owe SeatKo and submit payments.
import { Router } from 'express';
import { db, audit, getPlatformSettings } from '../db.js';
import { requireRole } from '../auth.js';
import { uploadProof, proofPath } from '../upload.js';
import { billingSummary, billingTerms } from '../billing.js';
import { h, str, int, oneOf, bad, notFound } from '../util.js';

const r = Router();
r.use(requireRole('admin'));

export const PAYMENT_METHODS = ['gcash', 'maya', 'bank_transfer', 'cash', 'other'];

export function paymentInstructions() {
  const p = getPlatformSettings();
  return { instructions: p.payment_instructions, gcash_name: p.gcash_name, gcash_number: p.gcash_number, bank_details: p.bank_details };
}

export function orgPayments(orgId) {
  return db.prepare(`
    SELECT p.*, u.name AS created_by_name, rv.name AS reviewed_by_name
    FROM billing_payments p LEFT JOIN users u ON u.id = p.created_by LEFT JOIN users rv ON rv.id = p.reviewed_by
    WHERE p.org_id = ? ORDER BY p.id DESC
  `).all(orgId);
}

export function orgCharges(orgId) {
  return db.prepare(`
    SELECT c.*, e.title AS event_title FROM billing_charges c LEFT JOIN events e ON e.id = c.event_id
    WHERE c.org_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 1000
  `).all(orgId);
}

r.get('/', (req, res) => {
  res.json({
    terms: billingTerms(req.org),
    summary: billingSummary(req.orgId),
    charges: orgCharges(req.orgId),
    payments: orgPayments(req.orgId),
    pay_to: paymentInstructions(),
  });
});

r.post('/payments', uploadProof.single('proof'), h((req, res) => {
  const amount = int(Math.round(Number(req.body.amount) * 100), 'Amount', { required: true, min: 1, max: 1_000_000_000 });
  const method = oneOf(req.body.method, 'Method', PAYMENT_METHODS, { required: true });
  const reference = str(req.body.reference, 'Reference number', { max: 100 }) ?? '';
  const note = str(req.body.note, 'Note', { max: 500 }) ?? '';
  if (!reference && !req.file) throw bad('Add the reference number or a screenshot of the payment');
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO billing_payments (org_id, amount_cents, method, reference, proof, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.orgId, amount, method, reference, req.file?.filename ?? null, note, req.user.id);
  audit(req, 'submit_payment', 'billing_payment', lastInsertRowid, { amount_cents: amount, method, reference });
  res.status(201).json(db.prepare('SELECT * FROM billing_payments WHERE id = ?').get(lastInsertRowid));
}));

r.get('/payments/:id/proof', h((req, res) => {
  const p = db.prepare('SELECT * FROM billing_payments WHERE id = ? AND org_id = ?').get(req.params.id, req.orgId);
  if (!p?.proof) throw notFound('Proof');
  res.sendFile(proofPath(p.proof));
}));

export default r;
