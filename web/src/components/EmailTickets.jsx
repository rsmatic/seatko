import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useApp } from '../state.jsx';
import { dateTime } from '../format.js';

export const isEmail = (s) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(String(s || '').trim());

/** Send (or re-send) an order's ticket links by email. */
export default function EmailTickets({ order, onSent }) {
  const { settings } = useApp();
  const [to, setTo] = useState(order.emailed_to || order.buyer_email || '');
  const [run, busy] = useAction();
  if (!settings?.email_enabled) return null;

  const send = async (e) => {
    e.preventDefault();
    const updated = await run(() => api(`/orders/${order.id}/email`, { method: 'POST', body: { email: to.trim() } }), `Tickets emailed to ${to.trim()}`);
    onSent?.(updated);
  };

  return (
    <form className="email-tickets" onSubmit={send}>
      <div className="field-label">Email the tickets</div>
      <div className="promo">
        <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="buyer@email.com" aria-label="Email address" />
        <button className="btn" disabled={busy || !isEmail(to)}>{busy ? 'Sending…' : order.emailed_at ? 'Send again' : 'Send'}</button>
      </div>
      {order.emailed_at && <div className="small sent-note">✓ Sent to {order.emailed_to} · {dateTime(order.emailed_at)}</div>}
    </form>
  );
}
