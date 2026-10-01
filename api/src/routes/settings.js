import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, audit } from '../db.js';
import { requireAuth, requireOrg, requireRole } from '../auth.js';
import { upload } from '../upload.js';
import { config } from '../config.js';
import { mailEnabled } from '../mailer.js';
import { h, str, color, bad } from '../util.js';

const r = Router();

/** The branding an organizer's tickets show. Also embedded in public ticket responses. */
export function publicSettings(orgId) {
  const s = getSettings(orgId);
  return {
    org_name: s.org_name,
    org_tagline: s.org_tagline,
    currency: s.currency,
    qr_color: s.qr_color,
    ticket_accent: s.ticket_accent,
    ticket_footer: s.ticket_footer,
    logo_url: s.logo ? `/uploads/${s.logo}` : '/api/settings/default-logo',
    has_custom_logo: !!s.logo,
    email_enabled: mailEnabled(),
  };
}

// Public: the bundled default (SeatKo) logo.
r.get('/default-logo', (_req, res) => res.sendFile(config.defaultLogo));

r.use(requireAuth, requireOrg);

r.get('/', (req, res) => res.json(publicSettings(req.orgId)));

const setSetting = db.prepare(`
  INSERT INTO org_settings (org_id, key, value) VALUES (?, ?, ?)
  ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value
`);

r.put('/', requireRole('admin'), h((req, res) => {
  const fields = {
    org_name: str(req.body.org_name, 'Organization name', { max: 100 }),
    org_tagline: str(req.body.org_tagline, 'Tagline', { max: 200 }),
    currency: str(req.body.currency, 'Currency', { max: 3 }),
    qr_color: color(req.body.qr_color, 'QR color'),
    ticket_accent: color(req.body.ticket_accent, 'Ticket accent'),
    ticket_footer: str(req.body.ticket_footer, 'Ticket footer', { max: 300 }),
  };
  if (fields.currency && !/^[A-Z]{3}$/.test(fields.currency)) throw bad('Currency must be a 3-letter ISO code, e.g. PHP');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) setSetting.run(req.orgId, k, v);
  audit(req, 'update', 'settings', null, fields);
  res.json(publicSettings(req.orgId));
}));

function removeOldLogo(orgId) {
  const { logo } = getSettings(orgId);
  if (logo) fs.rm(path.join(config.uploadDir, path.basename(logo)), { force: true }, () => {});
}

r.post('/logo', requireRole('admin'), upload.single('logo'), h((req, res) => {
  if (!req.file) throw bad('Choose an image file to upload');
  removeOldLogo(req.orgId);
  setSetting.run(req.orgId, 'logo', req.file.filename);
  audit(req, 'replace_logo', 'settings', null, req.file.originalname);
  res.json(publicSettings(req.orgId));
}));

r.delete('/logo', requireRole('admin'), h((req, res) => {
  removeOldLogo(req.orgId);
  setSetting.run(req.orgId, 'logo', '');
  audit(req, 'reset_logo', 'settings');
  res.json(publicSettings(req.orgId));
}));

export default r;
