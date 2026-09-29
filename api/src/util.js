import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg) => new HttpError(400, msg);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

/** Wrap a route handler so thrown errors and rejected promises reach the error middleware. */
export const h = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof out.catch === 'function') out.catch(next);
  } catch (err) {
    next(err);
  }
};

export function str(v, field, { required = false, max = 500 } = {}) {
  if (v === undefined || v === null) {
    if (required) throw bad(`${field} is required`);
    return undefined;
  }
  const s = String(v).trim();
  if (required && !s) throw bad(`${field} is required`);
  if (s.length > max) throw bad(`${field} is too long`);
  return s;
}

export function int(v, field, { required = false, min = -Infinity, max = Infinity } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${field} is required`);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} must be an integer between ${min} and ${max}`);
  return n;
}

export function oneOf(v, field, options, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${field} is required`);
    return undefined;
  }
  if (!options.includes(v)) throw bad(`${field} must be one of: ${options.join(', ')}`);
  return v;
}

export function color(v, field) {
  if (v === undefined) return undefined;
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw bad(`${field} must be a hex color like #d4a24c`);
  return v;
}

// Crockford-style alphabet: no 0/O/1/I/L to avoid misreads at the gate.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const ticketCode = () => `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
export const orderRef = () => `ORD-${randomCode(6)}`;

/** Build a partial UPDATE from an object of already-validated fields (undefined = skip). */
export function updateSet(fields) {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  return { sql: keys.map((k) => `${k} = @${k}`).join(', '), params: Object.fromEntries(keys.map((k) => [k, fields[k]])) };
}

export function rowLabel(index) {
  // 0 -> A, 25 -> Z, 26 -> AA ...
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
