import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, audit } from '../db.js';
import { requireAuth, requireOrg, requireRole } from '../auth.js';
import { upload } from '../upload.js';
import { config } from '../config.js';
import { mailEnabled } from '../mailer.js';
import { isSheetUrl } from '../sheets.js';
import { REQUEST_METHODS, requestMethods } from './requests.js';
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
    buy_instructions: s.buy_instructions,
    logo_url: s.logo ? `/uploads/${s.logo}` : '/api/settings/default-logo',
    has_custom_logo: !!s.logo,
    payment_qr_url: s.payment_qr ? `/uploads/${s.payment_qr}` : null,
    email_enabled: mailEnabled(),
  };
}

// Public: the bundled default (SeatKo) logo.
r.get('/default-logo', (_req, res) => res.sendFile(config.defaultLogo));

r.use(requireAuth, requireOrg);

r.get('/', (req, res) => {
  const s = getSettings(req.orgId);
  // The sheet URL works like a password, so only admins see it (and it is never in public responses).
  const admin = req.user.is_superadmin || req.user.role === 'admin';
  res.json({ ...publicSettings(req.orgId), online_requests: s.online_requests !== '0', request_methods: requestMethods(req.orgId), ...(admin ? { sheet_webhook_url: s.sheet_webhook_url } : {}) });
});

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
    buy_instructions: str(req.body.buy_instructions, 'How to buy', { max: 2000 }),
    online_requests: req.body.online_requests === undefined ? undefined : req.body.online_requests ? '1' : '0',
    sheet_webhook_url: str(req.body.sheet_webhook_url, 'Google Sheet URL', { max: 300 }),
    request_methods: req.body.request_methods === undefined ? undefined
      : [...new Set([].concat(req.body.request_methods))].filter((m) => REQUEST_METHODS.includes(m)).join(','),
  };
  if (fields.request_methods === '') throw bad('Choose at least one payment method');
  if (fields.sheet_webhook_url && !isSheetUrl(fields.sheet_webhook_url)) {
    throw bad('Paste the Apps Script web app URL; it looks like https://script.google.com/macros/s/…/exec');
  }
  if (fields.currency && !/^[A-Z]{3}$/.test(fields.currency)) throw bad('Currency must be a 3-letter ISO code, e.g. PHP');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) setSetting.run(req.orgId, k, v);
  audit(req, 'update', 'settings', null, { ...fields, sheet_webhook_url: fields.sheet_webhook_url ? '(set)' : fields.sheet_webhook_url });
  const s = getSettings(req.orgId);
  res.json({ ...publicSettings(req.orgId), online_requests: s.online_requests !== '0', request_methods: requestMethods(req.orgId), sheet_webhook_url: s.sheet_webhook_url });
}));

/** Deletes the file an image setting (logo, payment_qr) points to. */
function removeOldImage(orgId, key) {
  const file = getSettings(orgId)[key];
  if (file) fs.rm(path.join(config.uploadDir, path.basename(file)), { force: true }, () => {});
}

r.post('/logo', requireRole('admin'), upload.single('logo'), h((req, res) => {
  if (!req.file) throw bad('Choose an image file to upload');
  removeOldImage(req.orgId, 'logo');
  setSetting.run(req.orgId, 'logo', req.file.filename);
  audit(req, 'replace_logo', 'settings', null, req.file.originalname);
  res.json(publicSettings(req.orgId));
}));

r.delete('/logo', requireRole('admin'), h((req, res) => {
  removeOldImage(req.orgId, 'logo');
  setSetting.run(req.orgId, 'logo', '');
  audit(req, 'reset_logo', 'settings');
  res.json(publicSettings(req.orgId));
}));

// The QR code buyers scan to pay (e.g. a GCash or Maya QR), shown in the website's Get tickets window.
r.post('/payment-qr', requireRole('admin'), upload.single('qr'), h((req, res) => {
  if (!req.file) throw bad('Choose an image file to upload');
  removeOldImage(req.orgId, 'payment_qr');
  setSetting.run(req.orgId, 'payment_qr', req.file.filename);
  audit(req, 'replace_payment_qr', 'settings', null, req.file.originalname);
  res.json(publicSettings(req.orgId));
}));

r.delete('/payment-qr', requireRole('admin'), h((req, res) => {
  removeOldImage(req.orgId, 'payment_qr');
  setSetting.run(req.orgId, 'payment_qr', '');
  audit(req, 'remove_payment_qr', 'settings');
  res.json(publicSettings(req.orgId));
}));

export default r;
