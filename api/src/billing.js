// Platform billing: what each organizer owes SeatKo, recorded as a ledger in billing_charges.
// Charges are idempotent per (org, kind, ref), so re-running any of these is harmless.
import { db } from './db.js';

const peso = (cents) => `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const insertCharge = db.prepare(`
  INSERT OR IGNORE INTO billing_charges (org_id, kind, description, amount_cents, ref, event_id, created_by)
  VALUES (@org_id, @kind, @description, @amount_cents, @ref, @event_id, @created_by)
`);

function charge(row) {
  insertCharge.run({ event_id: null, created_by: null, ...row });
}

/**
 * Per-ticket model: a fixed fee per ticket and/or a percentage of the order total. The first
 * `free_tickets_per_event` paid tickets of each event are free. Complimentary orders are never billed.
 * Call inside the sale transaction, after the order's tickets are inserted.
 */
export function chargeTicketFees(org, order) {
  if (!org || org.billing_model !== 'per_ticket' || order.payment_method === 'comp') return;
  const n = db.prepare('SELECT COUNT(*) n FROM tickets WHERE order_id = ?').get(order.id).n;
  const prev = db.prepare(`
    SELECT COUNT(*) n FROM tickets k JOIN orders o ON o.id = k.order_id
    WHERE k.event_id = ? AND o.payment_method != 'comp' AND o.id != ?
  `).get(order.event_id, order.id).n;
  const free = org.free_tickets_per_event;
  const billable = Math.min(n, Math.max(0, prev + n - free) - Math.max(0, prev - free));
  if (!billable) return;
  const fixed = billable * org.fee_per_ticket_cents;
  const pct = Math.round((order.total_cents * (billable / n) * org.fee_percent_bp) / 10000);
  const amount = fixed + pct;
  if (amount <= 0) return;
  const parts = [];
  if (org.fee_per_ticket_cents) parts.push(`${billable} × ${peso(org.fee_per_ticket_cents)}`);
  if (org.fee_percent_bp) parts.push(`${org.fee_percent_bp / 100}% of sales`);
  charge({
    org_id: org.id, kind: 'ticket_fee', amount_cents: amount, ref: `order:${order.id}`, event_id: order.event_id,
    description: `Ticket fees · ${order.reference} (${parts.join(' + ')}${billable < n ? `, ${n - billable} free` : ''})`,
  });
}

/** Credit back the ticket fee of a refunded order. */
export function refundTicketFees(orgId, order) {
  const fee = db.prepare("SELECT * FROM billing_charges WHERE org_id = ? AND kind = 'ticket_fee' AND ref = ?").get(orgId, `order:${order.id}`);
  if (!fee) return;
  charge({
    org_id: orgId, kind: 'ticket_refund', amount_cents: -fee.amount_cents, ref: fee.ref, event_id: fee.event_id,
    description: `Refunded order ${order.reference}: ticket fees credited`,
  });
}

/** Per-event model: charged once, when the event first goes on sale. */
export function chargeEventFee(org, ev) {
  if (!org || org.billing_model !== 'per_event' || org.per_event_fee_cents <= 0) return;
  charge({
    org_id: org.id, kind: 'event_fee', amount_cents: org.per_event_fee_cents, ref: `event:${ev.id}`, event_id: ev.id,
    description: `Event fee · ${ev.title}`,
  });
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Subscription model: one charge per month from billing_start through the current month. */
export function syncSubscription(org) {
  if (!org || org.billing_model !== 'subscription' || org.monthly_fee_cents <= 0 || !/^\d{4}-\d{2}$/.test(org.billing_start || '')) return;
  const [y, m] = org.billing_start.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const now = monthKey(new Date());
  for (let i = 0; i < 240 && monthKey(d) <= now; i++, d.setMonth(d.getMonth() + 1)) {
    charge({
      org_id: org.id, kind: 'subscription', amount_cents: org.monthly_fee_cents, ref: monthKey(d),
      description: `Monthly subscription · ${d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`,
    });
  }
}

export function billingSummary(orgId) {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  syncSubscription(org);
  const charged = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) n FROM billing_charges WHERE org_id = ?').get(orgId).n;
  const paid = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) n FROM billing_payments WHERE org_id = ? AND status = 'approved'").get(orgId).n;
  const pending = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) n FROM billing_payments WHERE org_id = ? AND status = 'pending'").get(orgId).n;
  return { charged_cents: charged, paid_cents: paid, pending_cents: pending, balance_cents: charged - paid };
}

export function billingTerms(org) {
  return {
    billing_model: org.billing_model,
    fee_per_ticket_cents: org.fee_per_ticket_cents,
    fee_percent_bp: org.fee_percent_bp,
    free_tickets_per_event: org.free_tickets_per_event,
    monthly_fee_cents: org.monthly_fee_cents,
    per_event_fee_cents: org.per_event_fee_cents,
    billing_start: org.billing_start,
  };
}
