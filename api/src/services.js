import { db } from './db.js';
import { notFound } from './util.js';

/**
 * Load an event. Routes must pass the request's organization so one organizer can never reach
 * another's events; internal callers that already hold a checked event may omit it.
 */
export function getEvent(id, orgId) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!ev || (orgId !== undefined && ev.org_id !== orgId)) throw notFound('Event');
  return ev;
}

/** Per-tier capacity, sold and revenue for one event. */
export function tierSummary(eventId) {
  return db.prepare(`
    SELECT t.*,
      CASE WHEN t.kind = 'ga' THEN COALESCE(t.capacity, 0)
           ELSE (SELECT COUNT(*) FROM seats s WHERE s.tier_id = t.id AND s.status != 'blocked') END AS total,
      (SELECT COUNT(*) FROM tickets k WHERE k.tier_id = t.id AND k.status != 'void') AS sold,
      (SELECT COUNT(*) FROM tickets k WHERE k.tier_id = t.id AND k.status = 'used') AS checked_in,
      (SELECT COALESCE(SUM(k.price_cents), 0) FROM tickets k WHERE k.tier_id = t.id AND k.status != 'void') AS gross_cents
    FROM tiers t WHERE t.event_id = ? ORDER BY t.sort, t.id
  `).all(eventId);
}

export function eventSummary(eventId) {
  const tiers = tierSummary(eventId);
  const money = db.prepare(`
    SELECT COALESCE(SUM(total_cents), 0) revenue_cents, COALESCE(SUM(discount_cents), 0) discount_cents, COUNT(*) orders
    FROM orders WHERE event_id = ? AND status = 'paid'
  `).get(eventId);
  return {
    capacity: tiers.reduce((a, t) => a + t.total, 0),
    sold: tiers.reduce((a, t) => a + t.sold, 0),
    checked_in: tiers.reduce((a, t) => a + t.checked_in, 0),
    ...money,
  };
}

/** Flip on_sale <-> sold_out based on remaining inventory. */
export function refreshSoldOut(eventId) {
  const ev = getEvent(eventId);
  if (ev.status !== 'on_sale' && ev.status !== 'sold_out') return;
  const tiers = tierSummary(eventId).filter((t) => t.active);
  const remaining = tiers.reduce((a, t) => a + Math.max(0, t.total - t.sold), 0);
  const next = tiers.length && remaining === 0 ? 'sold_out' : 'on_sale';
  if (next !== ev.status) db.prepare("UPDATE events SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, eventId);
}
