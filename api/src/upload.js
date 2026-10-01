import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { bad } from './util.js';

const ALLOWED = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/gif': '.gif' };

function imageUpload(destination, allowed = ALLOWED) {
  return multer({
    storage: multer.diskStorage({
      destination,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${allowed[file.mimetype]}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!allowed[file.mimetype]) return cb(bad(`Only ${Object.values(allowed).join(', ')} images are allowed`));
      cb(null, true);
    },
  });
}

// Public images (logos, posters), served from /uploads.
export const upload = imageUpload(config.uploadDir);
export const uploadPath = (filename) => path.join(config.uploadDir, path.basename(filename));

// Payment proofs are private: stored outside /uploads and only served to the organizer and the owner.
// No SVG here, since these are screenshots and are rendered inline for review.
export const proofDir = path.join(path.dirname(config.dbPath), 'proofs');
fs.mkdirSync(proofDir, { recursive: true });
const PROOF_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
export const uploadProof = imageUpload(proofDir, PROOF_TYPES);
export const proofPath = (filename) => path.join(proofDir, path.basename(filename));
