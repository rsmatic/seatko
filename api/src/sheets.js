// Optional Google Sheet log of online ticket requests. The organizer deploys the Apps Script in
// deploy/google-sheet-apps-script.js as a web app and pastes its URL in Branding & settings;
// SeatKo then posts each request (and later its approval/rejection) to it. Rows are keyed by
// reference, so updates overwrite the same row.
import { config } from './config.js';
import { db, getSettings } from './db.js';

export const isSheetUrl = (u) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(u || '').trim());

const METHOD = { gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer', other: 'Other' };
const STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

function manila(utc) {
  const d = new Date(`${String(utc).replace(' ', 'T')}Z`);
  return Number.isNaN(+d) ? utc : d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}

/** Send the request's current state to the organizer's sheet. Never throws; failures are only logged. */
export function pushToSheet(requestId) {
  const r = db.prepare(`
    SELECT q.*, e.title AS event_title, o.reference AS order_reference, u.name AS reviewed_by_name
    FROM ticket_requests q JOIN events e ON e.id = q.event_id
    LEFT JOIN orders o ON o.id = q.order_id LEFT JOIN users u ON u.id = q.reviewed_by
    WHERE q.id = ?
  `).get(requestId);
  if (!r) return;
  const url = getSettings(r.org_id).sheet_webhook_url;
  if (!isSheetUrl(url)) return;

  const tickets = r.order_id ? db.prepare('SELECT code, seat_label, tier_name FROM tickets WHERE order_id = ? ORDER BY id').all(r.order_id) : [];
  const row = {
    reference: r.reference,
    submitted: manila(r.created_at),
    event: r.event_title,
    name: r.buyer_name,
    email: r.buyer_email,
    phone: r.buyer_phone,
    tickets: JSON.parse(r.items).map((i) => `${i.qty} × ${i.tier_name}`).join(', '),
    amount: r.amount_cents / 100,
    payment: METHOD[r.payment_method] ?? r.payment_method,
    payment_ref: r.payment_ref,
    buyer_note: r.note,
    status: STATUS[r.status],
    reviewed: r.reviewed_at ? `${manila(r.reviewed_at)} · ${r.reviewed_by_name ?? ''}` : '',
    review_note: r.review_note,
    seats: tickets.map((t) => t.seat_label ?? t.tier_name).join(', '),
    ticket_codes: tickets.map((t) => t.code).join(', '),
    order: r.order_reference ?? '',
    seatko_link: `${config.appUrl}/events/${r.event_id}/requests?request=${r.id}`,
    // Opens the payment screenshot in SeatKo (sign-in required).
    proof_link: r.proof ? `${config.appUrl}/requests/${r.id}/proof` : '',
  };

  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row), redirect: 'follow' })
    .then((res) => { if (!res.ok) console.error(`Google Sheet update for ${r.reference} failed: HTTP ${res.status}`); })
    .catch((e) => console.error(`Google Sheet update for ${r.reference} failed:`, e.message));
}
