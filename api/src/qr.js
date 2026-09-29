import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getSettings } from './db.js';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' };

let logoCache = { key: '', uri: '' };

/** Current logo as a data URI (uploaded logo if set, otherwise the bundled default). */
export function logoDataUri() {
  const { logo } = getSettings();
  let file = logo ? path.join(config.uploadDir, path.basename(logo)) : config.defaultLogo;
  if (!fs.existsSync(file)) file = config.defaultLogo;
  const stat = fs.statSync(file);
  const key = `${file}:${stat.mtimeMs}`;
  if (logoCache.key !== key) {
    const mime = MIME[path.extname(file).toLowerCase()] || 'image/png';
    logoCache = { key, uri: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` };
  }
  return logoCache.uri;
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Render a QR code as SVG with the logo in the middle.
 * Error correction level H tolerates ~30% damage; the logo (plus its white pad) covers well under that.
 */
export function qrSvg(text, { size = 512, color, withLogo = true } = {}) {
  const settings = getSettings();
  const fg = color || settings.qr_color || '#111111';
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const quiet = 3;
  const total = n + quiet * 2;

  // Logo box, in module units, centered. Kept to ~22% of the symbol width: larger boxes start eating the
  // alignment pattern (at module 18 for the version-2 codes we issue) and the code stops scanning.
  const logoModules = withLogo ? Math.floor(n * 0.22) | 1 : 0; // odd so it centers on a module
  const logoStart = (n - logoModules) / 2;
  const clearPad = 1;
  const inLogo = (r, c) =>
    withLogo &&
    r >= logoStart - clearPad && r < logoStart + logoModules + clearPad &&
    c >= logoStart - clearPad && c < logoStart + logoModules + clearPad;

  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  let dots = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c) || inFinder(r, c) || inLogo(r, c)) continue;
      dots += `M${c + quiet},${r + quiet}h1v1h-1z`;
    }
  }

  const finder = (r, c) => {
    const x = c + quiet;
    const y = r + quiet;
    return (
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.6" fill="none" stroke="${fg}" stroke-width="1"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.8" fill="${fg}"/>`
    );
  };

  let logo = '';
  if (withLogo) {
    // Use the whole cleared square: white disc edge-to-edge, logo inset by a thin ring.
    const cx = quiet + n / 2;
    const bg = logoModules / 2 + clearPad;
    const lr = bg - 0.35;
    logo =
      `<defs><clipPath id="logoClip"><circle cx="${cx}" cy="${cx}" r="${lr}"/></clipPath></defs>` +
      `<circle cx="${cx}" cy="${cx}" r="${bg}" fill="#fff"/>` +
      `<image href="${escapeAttr(logoDataUri())}" x="${cx - lr}" y="${cx - lr}" width="${lr * 2}" height="${lr * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path d="${dots}" fill="${fg}"/>` +
    `<g shape-rendering="geometricPrecision">${finder(0, 0)}${finder(0, n - 7)}${finder(n - 7, 0)}${logo}</g>` +
    `</svg>`
  );
}
