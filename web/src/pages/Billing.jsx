import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useLoad } from '../state.jsx';
import { dateTime, money } from '../format.js';
import { Badge, Empty, Field, Loadable, Modal, PageHeader, Stat } from '../components/ui.jsx';
import { Amount, BILL_METHOD_LABEL, CHARGE_LABEL, MODEL_LABEL, ProofImage, describeTerms } from '../components/BillingBits.jsx';

export default function Billing() {
  const state = useLoad('/billing');
  const [paying, setPaying] = useState(false);
  const [viewing, setViewing] = useState(null);

  return (
    <>
      <PageHeader title="Billing" sub="Your SeatKo plan, charges and payments">
        <button className="btn btn-primary" onClick={() => setPaying(true)}>Submit a payment</button>
      </PageHeader>
      <Loadable state={state}>
        {({ terms, summary, charges, payments, pay_to: payTo }) => (
          <>
            <div className="stats">
              <Stat label="Balance due" value={money(Math.max(0, summary.balance_cents))}
                sub={summary.balance_cents < 0 ? `${money(-summary.balance_cents)} credit` : summary.balance_cents === 0 ? 'All paid up' : null} />
              <Stat label="Total charged" value={money(summary.charged_cents)} />
              <Stat label="Total paid" value={money(summary.paid_cents)} />
              <Stat label="Awaiting confirmation" value={money(summary.pending_cents)} />
            </div>

            <div className="grid-2">
              <section className="card">
                <h3>Your plan</h3>
                <div className="terms"><strong>{MODEL_LABEL[terms.billing_model]}</strong></div>
                <p className="muted">{describeTerms(terms)}</p>
                <p className="small muted">Contact SeatKo to change your plan.</p>
              </section>
              <section className="card">
                <h3>How to pay</h3>
                <PayTo payTo={payTo} />
              </section>
            </div>

            <section className="card">
              <h3>Payments</h3>
              {!payments.length ? <Empty title="No payments yet" /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="small">{dateTime(p.created_at)}</td>
                          <td>{BILL_METHOD_LABEL[p.method] ?? p.method}</td>
                          <td className="mono small">{p.reference || '—'}</td>
                          <td className="num">{money(p.amount_cents)}</td>
                          <td><PayStatus p={p} />{p.review_note && <div className="muted small">{p.review_note}</div>}</td>
                          <td className="actions">{p.proof && <button className="btn btn-sm" onClick={() => setViewing(p)}>Screenshot</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h3>Charges</h3>
              {!charges.length ? <Empty title="No charges yet" /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Type</th><th>Details</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {charges.map((c) => (
                        <tr key={c.id}>
                          <td className="small nowrap">{dateTime(c.created_at)}</td>
                          <td>{CHARGE_LABEL[c.kind]}</td>
                          <td className="small">{c.description}{c.event_title && <div className="muted">{c.event_title}</div>}</td>
                          <td className="num"><Amount cents={c.amount_cents} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {paying && <PaymentForm balance={summary.balance_cents} payTo={payTo} onClose={() => setPaying(false)} onSaved={state.reload} />}
            {viewing && (
              <Modal title="Payment screenshot" onClose={() => setViewing(null)}>
                <ProofImage path={`/billing/payments/${viewing.id}/proof`} />
              </Modal>
            )}
          </>
        )}
      </Loadable>
    </>
  );
}

export function PayStatus({ p }) {
  const map = { pending: ['sold_out', 'Awaiting confirmation'], approved: ['paid', 'Confirmed'], rejected: ['void', 'Rejected'] };
  const [cls, label] = map[p.status];
  return <Badge status={cls}>{label}</Badge>;
}

export function PayTo({ payTo }) {
  return (
    <>
      {payTo.instructions && <p>{payTo.instructions}</p>}
      {(payTo.gcash_number || payTo.bank_details) && (
        <div className="pay-to">
          {payTo.gcash_number && <div><strong>GCash:</strong> {payTo.gcash_number}{payTo.gcash_name && ` (${payTo.gcash_name})`}</div>}
          {payTo.bank_details && <div className="mt-sm"><strong>Bank:</strong> {payTo.bank_details}</div>}
        </div>
      )}
    </>
  );
}

function PaymentForm({ balance, payTo, onClose, onSaved }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ amount: balance > 0 ? (balance / 100).toFixed(2) : '', method: 'gcash', reference: '', note: '' });
  const [file, setFile] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('proof', file);
    await run(() => api('/billing/payments', { method: 'POST', body: fd }), 'Payment submitted. SeatKo will confirm it shortly.');
    onSaved();
    onClose();
  };
  return (
    <Modal title="Submit a payment" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="pay-form" disabled={busy}>Submit</button></>}>
      <PayTo payTo={payTo} />
      <form id="pay-form" className="form-grid mt" onSubmit={submit}>
        <Field label="Amount paid (₱)"><input type="number" min="1" step="0.01" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Paid via">
          <select value={f.method} onChange={set('method')}>
            {Object.entries(BILL_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Reference number" span={2}><input value={f.reference} onChange={set('reference')} placeholder="GCash / bank reference no." /></Field>
        <Field label="Screenshot of payment" span={2} hint="PNG, JPG or WEBP, up to 5 MB">
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files[0] ?? null)} />
        </Field>
        <Field label="Note (optional)" span={2}><input value={f.note} onChange={set('note')} /></Field>
      </form>
    </Modal>
  );
}
