import { Router } from 'express';
import cors from 'cors';
import { db, getSettings } from '../db.js';
import { publicSettings } from './settings.js';
import { qrSvg } from '../qr.js';
import { tierSummary } from '../services.js';
import { h, notFound, int, color } from '../util.js';

// No auth: the ticket code itself is the bearer secret, so a ticket link can be sent to the buyer.
// Open CORS: these read-only routes are fetched by organizers' website embeds (see /embed.js).
const r = Router();
r.use(cors());

const PUBLIC_STATUSES = ['on_sale', 'sold_out', 'closed', 'cancelled'];

function publicEvent(ev) {
  const tiers = tierSummary(ev.id)
    .filter((t) => t.active)
    .map((t) => ({
      name: t.name, description: t.description, price_cents: t.price_cents, color: t.color,
      kind: t.kind, remaining: Math.max(0, t.total - t.sold),
    }));
  return {
    id: ev.id, title: ev.title, artist: ev.artist, description: ev.description, venue: ev.venue, address: ev.address,
    starts_at: ev.starts_at, doors_at: ev.doors_at, status: ev.status,
    poster_url: ev.poster ? `/uploads/${ev.poster}` : null,
    logo_url: ev.logo ? `/uploads/${ev.logo}` : null,
    currency: getSettings(ev.org_id).currency, tiers,
  };
}

const ACTIVE_ORG = "org_id IN (SELECT id FROM organizations WHERE status = 'active')";
const isPublic = (ev) => ev && ev.show_on_website && PUBLIC_STATUSES.includes(ev.status)
  && db.prepare('SELECT status FROM organizations WHERE id = ?').get(ev.org_id)?.status === 'active';

// Events visible to the public: not drafts, not switched off with "Show on website", and only from
// active organizers. Optional ?org= (organizer id) and ?artist= filters.
r.get('/events', h((req, res) => {
  const rows = db.prepare(`
    SELECT * FROM events WHERE status IN (${PUBLIC_STATUSES.map(() => '?').join(',')}) AND show_on_website = 1 AND ${ACTIVE_ORG}
      AND (? IS NULL OR org_id = ?) AND (? IS NULL OR artist = ? COLLATE NOCASE) ORDER BY starts_at
  `).all(...PUBLIC_STATUSES, req.query.org || null, Number(req.query.org) || null, req.query.artist || null, req.query.artist || null);
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(rows.map(publicEvent));
}));

r.get('/events/:id', h((req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!isPublic(ev)) throw notFound('Event');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(publicEvent(ev));
}));

const CODE = /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/;

function sendSvg(res, svg) {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(svg);
}

r.get('/qr/:code.svg', h((req, res) => {
  const code = req.params.code.toUpperCase();
  if (!CODE.test(code)) throw notFound('Ticket');
  const ev = db.prepare('SELECT e.logo, e.org_id FROM tickets k JOIN events e ON e.id = k.event_id WHERE k.code = ?').get(code);
  sendSvg(res, qrSvg(code, { size: int(req.query.size, 'Size', { min: 64, max: 2048 }) ?? 512, orgId: ev?.org_id, eventLogo: ev?.logo }));
}));

// Preview used by the settings page (lets the admin try colors before saving). ?org= picks whose logo.
r.get('/qr-preview.svg', h((req, res) => {
  const c = req.query.color ? color(`#${String(req.query.color).replace(/^#/, '')}`, 'Color') : undefined;
  const orgId = db.prepare('SELECT id FROM organizations WHERE id = ?').get(Number(req.query.org) || 0)?.id;
  sendSvg(res, qrSvg('PREV-IEW2-QR34', { size: 400, color: c, orgId }));
}));

r.get('/tickets/:code', h((req, res) => {
  const t = db.prepare(`
    SELECT k.code, k.status, k.tier_name, k.seat_label, k.holder_name, k.price_cents, k.checked_in_at,
           t.color AS tier_color, o.reference AS order_reference,
           e.id AS event_id, e.org_id, e.title, e.artist, e.venue, e.address, e.starts_at, e.doors_at, e.poster, e.status AS event_status,
           CASE WHEN e.logo IS NOT NULL THEN '/uploads/' || e.logo END AS logo_url
    FROM tickets k JOIN orders o ON o.id = k.order_id JOIN events e ON e.id = k.event_id LEFT JOIN tiers t ON t.id = k.tier_id
    WHERE k.code = ?
  `).get(req.params.code.toUpperCase());
  if (!t) throw notFound('Ticket');
  const { org_id: orgId, ...ticket } = t;
  res.json({ ...ticket, org: publicSettings(orgId) });
}));

export default r;
