import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApp, useLoad } from '../../state.jsx';
import { dateTime, money, toCents, ROLE_LABEL } from '../../format.js';
import { Badge, Empty, Field, Loadable, Modal, Stat, confirmAction } from '../../components/ui.jsx';
import { Amount, BILL_METHOD_LABEL, CHARGE_LABEL, MODEL_LABEL, TermsFields, describeTerms } from '../../components/BillingBits.jsx';
import { PayStatus } from '../Billing.jsx';
import { ReviewButtons, ProofButton } from './PlatformPayments.jsx';

export default function OrgDetail() {
  const { id } = useParams();
  const state = useLoad(`/platform/organizations/${id}`);
  const { openOrg } = useApp();
  const nav = useNavigate();
  const [run, busy] = useAction();
  const [modal, setModal] = useState(null); // 'terms' | 'charge' | 'payment' | { reset: user }

  const patch = async (body, msg) => {
    const o = await run(() => api(`/platform/organizations/${id}`, { method: 'PATCH', body }), msg);
    state.reload();
    return o;
  };

  return (
    <Loadable state={state}>
      {(o) => (
        <>
          <div className="crumbs"><Link to="/platform">Organizers</Link> / {o.name}</div>
          <div className="page-head">
            <div>
              <h1>{o.name} {o.status !== 'active' && <Badge status="cancelled">Suspended</Badge>}</h1>
              <div className="muted">{[o.contact_name, o.contact_email, o.contact_phone].filter(Boolean).join(' · ') || 'No contact details'}</div>
            </div>
            <div className="page-actions">
              <button className="btn btn-primary" onClick={() => { openOrg(o); nav('/'); }}>Open their workspace</button>
            </div>
          </div>

          <div className="stats">
            <Stat label="Balance" value={money(o.billing.balance_cents)} sub={o.billing.pending_cents ? `${money(o.billing.pending_cents)} awaiting review` : null} />
            <Stat label="Charged" value={money(o.billing.charged_cents)} />
            <Stat label="Paid" value={money(o.billing.paid_cents)} />
            <Stat label="Their ticket sales" value={money(o.sales_cents)} sub={`${o.tickets_sold} tickets · ${o.events} events`} />
          </div>

          <div className="grid-2">
            <section className="card">
              <div className="split"><h3>Billing terms</h3><button className="btn btn-sm" onClick={() => setModal('terms')}>Change</button></div>
              <div className="terms"><strong>{MODEL_LABEL[o.billing_model]}</strong></div>
              <p className="muted">{describeTerms(o)}</p>
              <div className="btn-row">
                <button className="btn" onClick={() => setModal('payment')}>Record a payment</button>
                <button className="btn" onClick={() => setModal('charge')}>Add charge / credit</button>
              </div>
              <h4>Account</h4>
              <div className="btn-row">
                {o.status === 'active'
                  ? <button className="btn btn-danger-ghost" disabled={busy}
                      onClick={() => confirmAction(`Suspend ${o.name}? Their staff can't sign in and their events disappear from websites. Ticket links keep working.`) && patch({ status: 'suspended' }, 'Organizer suspended')}>Suspend</button>
                  : <button className="btn" disabled={busy} onClick={() => patch({ status: 'active' }, 'Organizer reactivated')}>Reactivate</button>}
              </div>
              {o.notes && <><h4>Notes</h4><p className="pre small">{o.notes}</p></>}
            </section>

            <section className="card">
              <h3>Staff accounts</h3>
              <ul className="list compact">
                {o.users.map((u) => (
                  <li key={u.id} className="split small">
                    <span><strong>{u.name}</strong> · {u.email} · {ROLE_LABEL[u.role]}{!u.active && ' (inactive)'}</span>
                    <button className="btn btn-sm" onClick={() => setModal({ reset: u })}>Reset password</button>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card">
            <h3>Payments</h3>
            {!o.payments.length ? <Empty title="No payments yet" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {o.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="small">{dateTime(p.created_at)}<div className="muted">{p.created_by_name}</div></td>
                        <td>{BILL_METHOD_LABEL[p.method] ?? p.method}</td>
                        <td className="mono small">{p.reference || '—'}{p.note && <div className="muted">{p.note}</div>}</td>
                        <td className="num">{money(p.amount_cents)}</td>
                        <td><PayStatus p={p} /></td>
                        <td className="actions">
                          <ProofButton p={p} />
                          {p.status === 'pending' && <ReviewButtons p={p} onDone={state.reload} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h3>Charges</h3>
            {!o.charges.length ? <Empty title="No charges yet" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Details</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {o.charges.map((c) => (
                      <tr key={c.id}>
                        <td className="small nowrap">{dateTime(c.created_at)}</td>
                        <td>{CHARGE_LABEL[c.kind]}</td>
                        <td className="small">{c.description}</td>
                        <td className="num"><Amount cents={c.amount_cents} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {modal === 'terms' && <TermsModal org={o} onClose={() => setModal(null)} onSave={(body) => patch(body, 'Billing terms saved')} />}
          {modal === 'charge' && <ChargeModal org={o} onClose={() => setModal(null)} onSaved={state.reload} />}
          {modal === 'payment' && <RecordPaymentModal org={o} onClose={() => setModal(null)} onSaved={state.reload} />}
          {modal?.reset && <ResetPasswordModal user={modal.reset} onClose={() => setModal(null)} />}
        </>
      )}
    </Loadable>
  );
}

function TermsModal({ org, onClose, onSave }) {
  const [terms, setTerms] = useState({
    billing_model: org.billing_model, fee_per_ticket_cents: org.fee_per_ticket_cents, fee_percent_bp: org.fee_percent_bp,
    free_tickets_per_event: org.free_tickets_per_event, monthly_fee_cents: org.monthly_fee_cents,
    per_event_fee_cents: org.per_event_fee_cents, billing_start: org.billing_start ?? '',
  });
  const [f, setF] = useState({ name: org.name, contact_name: org.contact_name, contact_email: org.contact_email, contact_phone: org.contact_phone, notes: org.notes });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); await onSave({ ...f, ...terms }); onClose(); };
  return (
    <Modal title={`Edit ${org.name}`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="terms-form">Save</button></>}>
      <form id="terms-form" className="form-grid" onSubmit={submit}>
        <TermsFields value={terms} onChange={setTerms} />
        <p className="span-2 small muted" style={{ marginTop: 0 }}>New terms apply from now on. Charges already recorded stay as they are.</p>
        <Field label="Organizer name" span={2}><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Contact person"><input value={f.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Contact phone"><input value={f.contact_phone} onChange={set('contact_phone')} /></Field>
        <Field label="Contact email" span={2}><input type="email" value={f.contact_email} onChange={set('contact_email')} /></Field>
        <Field label="Notes (only you see these)" span={2}><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

function ChargeModal({ org, onClose, onSaved }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ kind: 'charge', description: '', amount: '' });
  const submit = async (e) => {
    e.preventDefault();
    const cents = toCents(f.amount) * (f.kind === 'credit' ? -1 : 1);
    await run(() => api(`/platform/organizations/${org.id}/charges`, { method: 'POST', body: { description: f.description, amount_cents: cents } }), 'Saved');
    onSaved();
    onClose();
  };
  return (
    <Modal title="Add charge or credit" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="charge-form" disabled={busy}>Save</button></>}>
      <form id="charge-form" className="form-grid" onSubmit={submit}>
        <Field label="Type">
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="charge">Charge (they owe more)</option>
            <option value="credit">Credit / discount (they owe less)</option>
          </select>
        </Field>
        <Field label="Amount (₱)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
        <Field label="Description" span={2}><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required placeholder="Setup fee, loyalty discount…" /></Field>
      </form>
    </Modal>
  );
}

function RecordPaymentModal({ org, onClose, onSaved }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ amount: org.billing.balance_cents > 0 ? (org.billing.balance_cents / 100).toFixed(2) : '', method: 'cash', reference: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    await run(() => api(`/platform/organizations/${org.id}/payments`, { method: 'POST', body: { amount_cents: toCents(f.amount), method: f.method, reference: f.reference } }), 'Payment recorded');
    onSaved();
    onClose();
  };
  return (
    <Modal title="Record a payment you received" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="rec-form" disabled={busy}>Record</button></>}>
      <form id="rec-form" className="form-grid" onSubmit={submit}>
        <Field label="Amount (₱)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Method">
          <select value={f.method} onChange={set('method')}>
            {Object.entries(BILL_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Reference (optional)" span={2}><input value={f.reference} onChange={set('reference')} /></Field>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const [run, busy] = useAction();
  const [pw, setPw] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    await run(() => api(`/platform/users/${user.id}/password`, { method: 'POST', body: { password: pw } }), `Password reset for ${user.email}`);
    onClose();
  };
  return (
    <Modal title={`Reset password · ${user.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="reset-form" disabled={busy}>Reset</button></>}>
      <form id="reset-form" onSubmit={submit}>
        <Field label="New temporary password" hint="At least 8 characters. Send it to them and ask them to change it.">
          <input value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
      </form>
    </Modal>
  );
}
