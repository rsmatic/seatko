import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import { bad } from './util.js';

const ALLOWED = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/gif': '.gif' };

export const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) return cb(bad('Only PNG, JPG, WEBP, SVG or GIF images are allowed'));
    cb(null, true);
  },
});

export const uploadPath = (filename) => path.join(config.uploadDir, path.basename(filename));
