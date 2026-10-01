import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money, fromCents, toCents } from '../format.js';
import { Field } from './ui.jsx';

export const MODEL_LABEL = {
  free: 'Free',
  per_ticket: 'Per-ticket fee',
  subscription: 'Monthly subscription',
  per_event: 'Per-event fee',
};

export const BILL_METHOD_LABEL = { gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer', cash: 'Cash', other: 'Other' };

export const CHARGE_LABEL = {
  ticket_fee: 'Ticket fees', ticket_refund: 'Refund credit', event_fee: 'Event fee', subscription: 'Subscription', adjustment: 'Adjustment',
};

/** One-line, plain-language description of an organizer's billing terms. */
export function describeTerms(t) {
  if (!t) return '';
  switch (t.billing_model) {
    case 'per_ticket': {
      const parts = [];
      if (t.fee_per_ticket_cents) parts.push(`${money(t.fee_per_ticket_cents)} per ticket`);
      if (t.fee_percent_bp) parts.push(`${t.fee_percent_bp / 100}% of ticket sales`);
      let s = parts.join(' + ') || 'No fee set';
      if (t.free_tickets_per_event) s += ` · first ${t.free_tickets_per_event} tickets of each event free`;
      return `${s} · complimentary tickets are free`;
    }
    case 'subscription':
      return `${money(t.monthly_fee_cents)} per month${t.billing_start ? ` from ${t.billing_start}` : ' (start month not set)'}`;
    case 'per_event':
      return `${money(t.per_event_fee_cents)} per event, charged when the event goes on sale`;
    default:
      return 'Free, no charges';
  }
}

/** Editable billing terms (owner side). `value` uses API field names; amounts in cents. */
export function TermsFields({ value, onChange }) {
  const set = (k, conv = (x) => x) => (e) => onChange({ ...value, [k]: conv(e.target.value) });
  const pesos = (k) => ({ value: value[k] === undefined ? '' : fromCents(value[k]), onChange: set(k, toCents) });
  return (
    <>
      <Field label="Billing model" span={2}>
        <select value={value.billing_model} onChange={set('billing_model')}>
          {Object.entries(MODEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      {value.billing_model === 'per_ticket' && (
        <>
          <Field label="Fee per ticket (₱)"><input type="number" min="0" step="0.01" {...pesos('fee_per_ticket_cents')} /></Field>
          <Field label="Percent of sales (%)" hint="e.g. 2.5">
            <input type="number" min="0" max="50" step="0.1" value={(value.fee_percent_bp || 0) / 100}
              onChange={set('fee_percent_bp', (v) => Math.round(Number(v || 0) * 100))} />
          </Field>
          <Field label="Free tickets per event" hint="Tickets per event before fees start" span={2}>
            <input type="number" min="0" value={value.free_tickets_per_event ?? 0} onChange={set('free_tickets_per_event', (v) => Number(v || 0))} />
          </Field>
        </>
      )}
      {value.billing_model === 'subscription' && (
        <>
          <Field label="Monthly fee (₱)"><input type="number" min="0" step="0.01" {...pesos('monthly_fee_cents')} /></Field>
          <Field label="First billed month"><input type="month" value={value.billing_start ?? ''} onChange={set('billing_start')} /></Field>
        </>
      )}
      {value.billing_model === 'per_event' && (
        <Field label="Fee per event (₱)" span={2} hint="Charged once, the first time each event is put on sale">
          <input type="number" min="0" step="0.01" {...pesos('per_event_fee_cents')} />
        </Field>
      )}
      <div className="span-2 muted small" style={{ marginBottom: '.9rem' }}>{describeTerms(value)}</div>
    </>
  );
}

/** Payment proofs are private, so they're fetched with the session and shown from a blob URL. */
export function ProofImage({ path }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let obj;
    api(path, { raw: true })
      .then((r) => r.blob())
      .then((b) => { obj = URL.createObjectURL(b); if (live) setUrl(obj); })
      .catch(() => live && setFailed(true));
    return () => { live = false; if (obj) URL.revokeObjectURL(obj); };
  }, [path]);
  if (failed) return <span className="muted small">Could not load the screenshot</span>;
  if (!url) return <span className="muted small">Loading screenshot…</span>;
  return <a href={url} target="_blank" rel="noreferrer"><img className="proof-thumb" src={url} alt="Payment screenshot" /></a>;
}

export function Amount({ cents }) {
  return <span className={cents < 0 ? 'amount-neg' : ''}>{cents < 0 ? `−${money(-cents)}` : money(cents)}</span>;
}
