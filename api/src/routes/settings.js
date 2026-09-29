import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, audit } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { upload } from '../upload.js';
import { config } from '../config.js';
import { h, str, color, bad } from '../util.js';

const r = Router();

export function publicSettings() {
  const s = getSettings();
  return {
    org_name: s.org_name,
    org_tagline: s.org_tagline,
    currency: s.currency,
    qr_color: s.qr_color,
    ticket_accent: s.ticket_accent,
    ticket_footer: s.ticket_footer,
    logo_url: s.logo ? `/uploads/${s.logo}` : '/api/settings/default-logo',
    has_custom_logo: !!s.logo,
  };
}

// Public: the ticket page and login screen need branding without a session.
r.get('/', (_req, res) => res.json(publicSettings()));
r.get('/default-logo', (_req, res) => res.sendFile(config.defaultLogo));

r.put('/', requireAuth, requireRole('admin'), h((req, res) => {
  const fields = {
    org_name: str(req.body.org_name, 'Organization name', { max: 100 }),
    org_tagline: str(req.body.org_tagline, 'Tagline', { max: 200 }),
    currency: str(req.body.currency, 'Currency', { max: 3 }),
    qr_color: color(req.body.qr_color, 'QR color'),
    ticket_accent: color(req.body.ticket_accent, 'Ticket accent'),
    ticket_footer: str(req.body.ticket_footer, 'Ticket footer', { max: 300 }),
  };
  if (fields.currency && !/^[A-Z]{3}$/.test(fields.currency)) throw bad('Currency must be a 3-letter ISO code, e.g. PHP');
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) stmt.run(k, v);
  audit(req, 'update', 'settings', null, fields);
  res.json(publicSettings());
}));

function removeOldLogo() {
  const { logo } = getSettings();
  if (logo) fs.rm(path.join(config.uploadDir, path.basename(logo)), { force: true }, () => {});
}

r.post('/logo', requireAuth, requireRole('admin'), upload.single('logo'), h((req, res) => {
  if (!req.file) throw bad('Choose an image file to upload');
  removeOldLogo();
  db.prepare("UPDATE settings SET value = ? WHERE key = 'logo'").run(req.file.filename);
  audit(req, 'replace_logo', 'settings', null, req.file.originalname);
  res.json(publicSettings());
}));

r.delete('/logo', requireAuth, requireRole('admin'), h((req, res) => {
  removeOldLogo();
  db.prepare("UPDATE settings SET value = '' WHERE key = 'logo'").run();
  audit(req, 'reset_logo', 'settings');
  res.json(publicSettings());
}));

export default r;
