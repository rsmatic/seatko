import { Router } from 'express';
import { db, audit } from '../db.js';
import { MANAGE, requireRole } from '../auth.js';
import { getEvent, refreshSoldOut } from '../services.js';
import { h, str, int, oneOf, bad, notFound, rowLabel } from '../util.js';

// Mounted at /api/events/:id
const r = Router({ mergeParams: true });

function checkTier(eventId, tierId) {
  if (tierId === null || tierId === undefined) return null;
  const t = db.prepare('SELECT * FROM tiers WHERE id = ? AND event_id = ?').get(tierId, eventId);
  if (!t) throw bad('Unknown tier for this event');
  if (t.kind !== 'seated') throw bad('Only seated tiers can be assigned to seats');
  return t.id;
}

function getSection(eventId, sectionId) {
  const s = db.prepare('SELECT * FROM sections WHERE id = ? AND event_id = ?').get(sectionId, eventId);
  if (!s) throw notFound('Section');
  return s;
}

r.get('/seatmap', h((req, res) => {
  const ev = getEvent(req.params.id);
  res.json({
    sections: db.prepare('SELECT * FROM sections WHERE event_id = ? ORDER BY sort, id').all(ev.id),
    seats: db.prepare(`
      SELECT s.id, s.section_id, s.row_label, s.row_index, s.number, s.tier_id, s.status,
             k.code AS ticket_code, k.holder_name
      FROM seats s
      LEFT JOIN tickets k ON k.seat_id = s.id AND k.status != 'void'
      WHERE s.event_id = ? ORDER BY s.section_id, s.row_index, s.number
    `).all(ev.id),
  });
}));

const insertSeat = db.prepare(`
  INSERT OR IGNORE INTO seats (event_id, section_id, row_label, row_index, number, tier_id) VALUES (?, ?, ?, ?, ?, ?)
`);

function fillSeats(eventId, sectionId, rows, perRow, tierId) {
  for (let r = 0; r < rows; r++) {
    for (let n = 1; n <= perRow; n++) insertSeat.run(eventId, sectionId, rowLabel(r), r, n, tierId);
  }
}

r.post('/sections', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id);
  const name = str(req.body.name, 'Section name', { required: true, max: 100 });
  const rows = int(req.body.rows, 'Rows', { required: true, min: 1, max: 100 });
  const perRow = int(req.body.seats_per_row, 'Seats per row', { required: true, min: 1, max: 200 });
  const tierId = checkTier(ev.id, req.body.tier_id || null);
  const id = db.transaction(() => {
    const sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 n FROM sections WHERE event_id = ?').get(ev.id).n;
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO sections (event_id, name, tier_id, rows, seats_per_row, sort) VALUES (?, ?, ?, ?, ?, ?)
    `).run(ev.id, name, tierId, rows, perRow, sort);
    fillSeats(ev.id, lastInsertRowid, rows, perRow, tierId);
    return lastInsertRowid;
  })();
  audit(req, 'create', 'section', id, { name, rows, perRow });
  refreshSoldOut(ev.id);
  res.status(201).json(getSection(ev.id, id));
}));

r.patch('/sections/:sectionId', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id);
  const sec = getSection(ev.id, req.params.sectionId);
  const name = str(req.body.name, 'Section name', { max: 100 });
  const rows = int(req.body.rows, 'Rows', { min: 1, max: 100 }) ?? sec.rows;
  const perRow = int(req.body.seats_per_row, 'Seats per row', { min: 1, max: 200 }) ?? sec.seats_per_row;
  const sort = int(req.body.sort, 'Sort', { min: 0, max: 10_000 });
  const tierChanged = req.body.tier_id !== undefined;
  const tierId = tierChanged ? checkTier(ev.id, req.body.tier_id || null) : sec.tier_id;

  db.transaction(() => {
    if (rows < sec.rows || perRow < sec.seats_per_row) {
      const cut = db.prepare(`
        SELECT COUNT(*) n FROM seats WHERE section_id = ? AND status = 'sold' AND (row_index >= ? OR number > ?)
      `).get(sec.id, rows, perRow).n;
      if (cut) throw bad(`Cannot shrink the section: ${cut} sold seat(s) would be removed`);
      db.prepare('DELETE FROM seats WHERE section_id = ? AND (row_index >= ? OR number > ?)').run(sec.id, rows, perRow);
    }
    fillSeats(ev.id, sec.id, rows, perRow, tierId);
    if (tierChanged) db.prepare("UPDATE seats SET tier_id = ? WHERE section_id = ? AND status != 'sold'").run(tierId, sec.id);
    db.prepare(`
      UPDATE sections SET name = COALESCE(?, name), rows = ?, seats_per_row = ?, tier_id = ?, sort = COALESCE(?, sort) WHERE id = ?
    `).run(name ?? null, rows, perRow, tierId, sort ?? null, sec.id);
  })();
  audit(req, 'update', 'section', sec.id, req.body);
  refreshSoldOut(ev.id);
  res.json(getSection(ev.id, sec.id));
}));

r.delete('/sections/:sectionId', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id);
  const sec = getSection(ev.id, req.params.sectionId);
  if (db.prepare("SELECT 1 FROM seats WHERE section_id = ? AND status = 'sold'").get(sec.id)) {
    throw bad('This section has sold seats and cannot be deleted');
  }
  db.prepare('DELETE FROM sections WHERE id = ?').run(sec.id);
  audit(req, 'delete', 'section', sec.id, sec.name);
  refreshSoldOut(ev.id);
  res.json({ ok: true });
}));

// Bulk seat operations: block / unblock / assign tier. Sold seats are never touched.
r.post('/seats/bulk', requireRole(...MANAGE), h((req, res) => {
  const ev = getEvent(req.params.id);
  const action = oneOf(req.body.action, 'Action', ['block', 'unblock', 'assign_tier'], { required: true });
  const ids = Array.isArray(req.body.seat_ids) ? req.body.seat_ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) throw bad('Select at least one seat');
  const tierId = action === 'assign_tier' ? checkTier(ev.id, req.body.tier_id || null) : null;

  const placeholders = ids.map(() => '?').join(',');
  const where = `event_id = ? AND id IN (${placeholders}) AND status != 'sold'`;
  let changed;
  if (action === 'block') changed = db.prepare(`UPDATE seats SET status = 'blocked' WHERE ${where}`).run(ev.id, ...ids).changes;
  if (action === 'unblock') changed = db.prepare(`UPDATE seats SET status = 'available' WHERE ${where}`).run(ev.id, ...ids).changes;
  if (action === 'assign_tier') changed = db.prepare(`UPDATE seats SET tier_id = ? WHERE ${where}`).run(tierId, ev.id, ...ids).changes;

  audit(req, `seats_${action}`, 'event', ev.id, { count: changed, tier_id: tierId });
  refreshSoldOut(ev.id);
  res.json({ changed, skipped: ids.length - changed });
}));

export default r;
