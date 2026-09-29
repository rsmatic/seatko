let currency = 'PHP';
export const setCurrency = (c) => { currency = c || 'PHP'; };

export function money(cents) {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency, minimumFractionDigits: 2 }).format((cents || 0) / 100);
  } catch {
    return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

export const toCents = (v) => Math.round(Number(v || 0) * 100);
export const fromCents = (c) => ((c || 0) / 100).toFixed(2);

/** Server timestamps are UTC "YYYY-MM-DD HH:MM:SS"; event times are local "YYYY-MM-DDTHH:MM". */
export function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  return new Date(s);
}

export function dateTime(s) {
  const d = parseDate(s);
  if (!d || Number.isNaN(+d)) return '—';
  return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function dateLong(s) {
  const d = parseDate(s);
  if (!d || Number.isNaN(+d)) return '—';
  return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function timeOnly(s) {
  const d = parseDate(s);
  if (!d || Number.isNaN(+d)) return '—';
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export const STATUS_LABEL = {
  draft: 'Draft', on_sale: 'On sale', sold_out: 'Sold out', closed: 'Closed', cancelled: 'Cancelled',
  valid: 'Valid', used: 'Checked in', void: 'Void', paid: 'Paid', refunded: 'Refunded',
};

export const PAYMENT_LABEL = {
  cash: 'Cash', gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer', card: 'Card', comp: 'Complimentary', other: 'Other',
};

export const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier', scanner: 'Scanner' };
export const ROLE_HELP = {
  admin: 'Everything, including users, branding and the activity log',
  manager: 'Events, pricing, seating, promo codes, sales, refunds, reports, check-in',
  cashier: 'Box-office sales and ticket lookups',
  scanner: 'Gate check-in only',
};
