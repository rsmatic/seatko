import nodemailer from 'nodemailer';
import { config } from './config.js';
import { HttpError } from './util.js';

const { mail } = config;
const transport = mail.host && mail.user
  ? nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.port === 465,
    auth: { user: mail.user, pass: mail.password },
  })
  : null;

export const mailEnabled = () => !!transport;

export const isEmail = (s) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(String(s || '').trim());

export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!transport) throw new HttpError(503, 'Email is not set up on this server');
  await transport.sendMail({ from: mail.from || mail.user, to, subject, html, text, replyTo: replyTo || undefined });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function when(ev) {
  const d = new Date(ev.starts_at);
  if (Number.isNaN(+d)) return ev.starts_at;
  const day = d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const doors = ev.doors_at ? ` (doors open ${new Date(ev.doors_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })})` : '';
  return `${day} · ${time}${doors}`;
}

/** The "your tickets" email for an order: one button per ticket linking to its QR page. */
export function ticketEmail({ order, tickets, event, org }) {
  const link = (t) => `${config.appUrl}/t/${t.code}`;
  const accent = org.ticket_accent || '#d4a24c';
  const logo = org.logo ? `${config.apiUrl}/uploads/${encodeURIComponent(org.logo)}` : null;
  const place = [event.venue, event.address].filter(Boolean).join(', ') || 'Venue to be announced';
  const label = (t) => t.seat_label ?? t.tier_name;
  const subject = `Your ${tickets.length === 1 ? 'ticket' : `${tickets.length} tickets`} for ${event.title}`;

  const rows = tickets.map((t) => `
    <tr><td style="padding:12px 0;border-top:1px solid #eee">
      <div style="font-size:15px;font-weight:600;color:#111">${esc(label(t))}</div>
      <div style="font-size:13px;color:#666">${esc(t.tier_name)} · ${esc(t.holder_name)} · <span style="font-family:monospace">${esc(t.code)}</span></div>
      <a href="${esc(link(t))}" style="display:inline-block;margin-top:8px;padding:9px 16px;background:${esc(accent)};color:#111;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View ticket &amp; QR code</a>
    </td></tr>`).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#111;padding:20px 24px;color:#fff">
      ${logo ? `<img src="${esc(logo)}" width="40" height="40" alt="" style="border-radius:50%;vertical-align:middle;margin-right:10px">` : ''}
      <span style="font-size:16px;font-weight:700;letter-spacing:2px;vertical-align:middle">${esc(org.org_name || 'SeatKo')}</span>
    </td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 6px;font-size:15px;color:#111">Hi ${esc(order.buyer_name)},</p>
      <p style="margin:0 0 18px;font-size:15px;color:#333">Here ${tickets.length === 1 ? 'is your ticket' : 'are your tickets'} for:</p>
      <div style="font-size:20px;font-weight:700;color:#111">${esc(event.title)}</div>
      ${event.artist ? `<div style="font-size:13px;color:${esc(accent)};font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:2px">${esc(event.artist)}</div>` : ''}
      <p style="margin:12px 0 4px;font-size:14px;color:#333">📅 ${esc(when(event))}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#333">📍 ${esc(place)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <p style="margin:18px 0 0;font-size:13px;color:#666">Show the QR code at the entrance. Each ticket can be scanned only once, so keep these links private.</p>
    </td></tr>
    <tr><td style="padding:14px 24px;background:#fafafa;font-size:12px;color:#888">
      Order ${esc(order.reference)} · Sent by SeatKo for ${esc(org.org_name || 'the organizer')}.
      Questions about the event? Reply to this email or contact the organizer.
    </td></tr>
  </table></td></tr></table></body></html>`;

  const text = [
    `Hi ${order.buyer_name},`,
    '',
    `Here ${tickets.length === 1 ? 'is your ticket' : 'are your tickets'} for ${event.title}`,
    when(event),
    place,
    '',
    ...tickets.map((t) => `${label(t)} (${t.code}): ${link(t)}`),
    '',
    'Show the QR code at the entrance. Each ticket can be scanned only once.',
    `Order ${order.reference} · Sent by SeatKo for ${org.org_name || 'the organizer'}`,
  ].join('\n');

  return { subject, html, text };
}

// ---------- online ticket request emails ----------

function shell(org, inner, footer) {
  const logo = org.logo ? `${config.apiUrl}/uploads/${encodeURIComponent(org.logo)}` : null;
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#111;padding:20px 24px;color:#fff">
      ${logo ? `<img src="${esc(logo)}" width="40" height="40" alt="" style="border-radius:50%;vertical-align:middle;margin-right:10px">` : ''}
      <span style="font-size:16px;font-weight:700;letter-spacing:2px;vertical-align:middle">${esc(org.org_name || 'SeatKo')}</span>
    </td></tr>
    <tr><td style="padding:24px;font-size:15px;color:#333;line-height:1.5">${inner}</td></tr>
    <tr><td style="padding:14px 24px;background:#fafafa;font-size:12px;color:#888">${footer}</td></tr>
  </table></td></tr></table></body></html>`;
}

const METHOD_LABEL = { gcash: 'GCash', maya: 'Maya', bank_transfer: 'bank transfer', cash: 'cash', other: 'other' };
const methodLabel = (m) => METHOD_LABEL[m] ?? m;
const requestLines = (req) => JSON.parse(req.items).map((i) => `${i.qty} × ${i.tier_name}`);
const peso = (c) => `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Sent right after a buyer submits a request from the organizer's website. */
export function requestReceivedEmail({ request, event, org }) {
  const lines = requestLines(request);
  const onsite = request.channel === 'onsite';
  const subject = `We received your ticket request for ${event.title}`;
  const inner = `
    <p style="margin:0 0 12px">Hi ${esc(request.buyer_name)},</p>
    <p style="margin:0 0 12px">Thank you! We received your request${onsite ? '' : ' and payment details'} for <strong>${esc(event.title)}</strong> (${esc(when(event))}).</p>
    <p style="margin:0 0 4px"><strong>${lines.map(esc).join('<br>')}</strong></p>
    <p style="margin:0 0 12px">Amount: ${esc(peso(request.amount_cents))} via ${esc(methodLabel(request.payment_method))}${request.payment_ref ? ` (ref. ${esc(request.payment_ref)})` : ''}</p>
    <p style="margin:0">${onsite
    ? `Go to the ticket booth, show your reference <strong>${esc(request.reference)}</strong> and pay there. Your tickets with their QR codes are emailed to this address as soon as you have paid.`
    : "We'll check your payment and email your tickets with their QR codes to this address. Seats are assigned once the payment is confirmed."}</p>`;
  const footer = `Request ${esc(request.reference)} · Sent by SeatKo for ${esc(org.org_name || 'the organizer')}. Reply to this email if you have questions.`;
  const text = [`Hi ${request.buyer_name},`, '', `We received your ticket request for ${event.title} (${when(event)}):`, ...lines,
    `Amount: ${peso(request.amount_cents)} via ${methodLabel(request.payment_method)}${request.payment_ref ? ` (ref. ${request.payment_ref})` : ''}`, '',
    onsite ? `Go to the ticket booth, show your reference ${request.reference} and pay there. Your tickets are emailed once you have paid.`
      : "We'll check your payment and email your tickets once it is confirmed.", `Request ${request.reference}`].join('\n');
  return { subject, html: shell(org, inner, footer), text };
}

/** Sent when the organizer can't confirm a request's payment. */
export function requestRejectedEmail({ request, event, org, reason }) {
  const subject = `About your ticket request for ${event.title}`;
  const inner = `
    <p style="margin:0 0 12px">Hi ${esc(request.buyer_name)},</p>
    <p style="margin:0 0 12px">We couldn't confirm your ticket request for <strong>${esc(event.title)}</strong> (${esc(requestLines(request).join(', '))}).</p>
    ${reason ? `<p style="margin:0 0 12px;padding:10px 12px;background:#fff4f4;border-left:3px solid #d23f3f">${esc(reason)}</p>` : ''}
    <p style="margin:0">Please reply to this email or message us so we can sort it out.</p>`;
  const footer = `Request ${esc(request.reference)} · Sent by SeatKo for ${esc(org.org_name || 'the organizer')}.`;
  const text = [`Hi ${request.buyer_name},`, '', `We couldn't confirm your ticket request for ${event.title}.`, reason ? `Reason: ${reason}` : '',
    'Please reply to this email so we can sort it out.', `Request ${request.reference}`].filter((l) => l !== null).join('\n');
  return { subject, html: shell(org, inner, footer), text };
}
