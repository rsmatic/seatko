import { Router } from 'express';
import { db } from '../db.js';
import { MANAGE, requireRole } from '../auth.js';
import { eventFor, seesAllEvents, eventSummary, tierSummary } from '../services.js';
import { h, int } from '../util.js';

const r = Router();

r.get('/stats/overview', (req, res) => {
  // Events this user may see: the whole organizer, or only their assigned events.
  const org = { org: req.orgId, all: seesAllEvents(req.user) ? 1 : 0, uid: req.user.id };
  const MINE = '(SELECT id FROM events WHERE org_id = @org AND (@all = 1 OR id IN (SELECT event_id FROM user_events WHERE user_id = @uid)))';
  const totals = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status = 'paid' AND event_id IN ${MINE}) AS revenue_cents,
      (SELECT COUNT(*) FROM tickets WHERE status != 'void' AND event_id IN ${MINE}) AS tickets_sold,
      (SELECT COUNT(*) FROM tickets WHERE status = 'used' AND event_id IN ${MINE}) AS checked_in,
      (SELECT COUNT(*) FROM orders WHERE status = 'paid' AND event_id IN ${MINE}) AS orders,
      (SELECT COUNT(*) FROM events WHERE status IN ('on_sale','sold_out') AND id IN ${MINE}) AS events_on_sale
  `).get(org);
  const upcoming = db.prepare(`
    SELECT * FROM events WHERE id IN ${MINE} AND status NOT IN ('cancelled','closed') ORDER BY starts_at ASC LIMIT 6
  `).all(org).map((e) => ({ ...e, summary: eventSummary(e.id) }));
  const daily = db.prepare(`
    SELECT date(o.created_at, 'localtime') AS day, SUM(o.total_cents) AS revenue_cents,
           SUM((SELECT COUNT(*) FROM tickets k WHERE k.order_id = o.id)) AS tickets
    FROM orders o WHERE o.status = 'paid' AND o.created_at >= datetime('now', '-30 days') AND o.event_id IN ${MINE}
    GROUP BY day ORDER BY day
  `).all(org);
  const recent = db.prepare(`
    SELECT o.*, e.title AS event_title, u.name AS created_by_name,
      (SELECT COUNT(*) FROM tickets k WHERE k.order_id = o.id) AS ticket_count
    FROM orders o JOIN events e ON e.id = o.event_id LEFT JOIN users u ON u.id = o.created_by
    WHERE e.id IN ${MINE}
    ORDER BY o.id DESC LIMIT 8
  `).all(org);
  res.json({ totals, upcoming, daily, recent });
});

r.get('/events/:id/stats', requireRole(...MANAGE), h((req, res) => {
  const ev = eventFor(req, req.params.id);
  res.json({
    summary: eventSummary(ev.id),
    tiers: tierSummary(ev.id),
    by_method: db.prepare(`
      SELECT payment_method, COUNT(*) orders, SUM(total_cents) revenue_cents FROM orders
      WHERE event_id = ? AND status = 'paid' GROUP BY payment_method ORDER BY revenue_cents DESC
    `).all(ev.id),
    by_cashier: db.prepare(`
      SELECT COALESCE(u.name, 'Deleted user') AS name, COUNT(*) orders, SUM(o.total_cents) revenue_cents
      FROM orders o LEFT JOIN users u ON u.id = o.created_by
      WHERE o.event_id = ? AND o.status = 'paid' GROUP BY o.created_by ORDER BY revenue_cents DESC
    `).all(ev.id),
    daily: db.prepare(`
      SELECT date(created_at, 'localtime') AS day, COUNT(*) orders, SUM(total_cents) revenue_cents FROM orders
      WHERE event_id = ? AND status = 'paid' GROUP BY day ORDER BY day
    `).all(ev.id),
    promos: db.prepare('SELECT code, kind, value, used_count, max_uses FROM promo_codes WHERE event_id = ? ORDER BY used_count DESC').all(ev.id),
  });
}));

r.get('/audit', requireRole('admin'), h((req, res) => {
  const limit = int(req.query.limit, 'Limit', { min: 1, max: 1000 }) ?? 200;
  res.json(db.prepare(`
    SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.org_id = ?
    ORDER BY a.id DESC LIMIT ?
  `).all(req.orgId, limit));
}));

export default r;
