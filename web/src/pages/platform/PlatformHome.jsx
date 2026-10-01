import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApp, useLoad } from '../../state.jsx';
import { dateTime, money } from '../../format.js';
import { Badge, Empty, Field, Loadable, Modal, PageHeader, Stat } from '../../components/ui.jsx';
import { MODEL_LABEL, TermsFields, describeTerms } from '../../components/BillingBits.jsx';

export default function PlatformHome() {
  const overview = useLoad('/platform/overview');
  const orgs = useLoad('/platform/organizations');
  const [creating, setCreating] = useState(false);
  const { openOrg } = useApp();
  const nav = useNavigate();

  const open = (o) => { openOrg(o); nav('/'); };

  return (
    <>
      <PageHeader title="Organizers" sub="Everyone using SeatKo, what they owe and what they've paid">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New organizer</button>
      </PageHeader>

      <Loadable state={overview}>
        {(o) => (
          <div className="stats">
            <Stat label="Organizers" value={o.organizations} sub={`${o.active} active`} />
            <Stat label="Outstanding" value={money(o.outstanding_cents)} sub="Total unpaid balances" />
            <Stat label="Collected this month" value={money(o.collected_month_cents)} sub={`${money(o.collected_cents)} all time`} />
            <Stat label="Payments to review" value={o.pending_payments}
              sub={o.pending_payments ? <Link to="/platform/payments">Review now →</Link> : 'Nothing pending'} />
          </div>
        )}
      </Loadable>

      <Loadable state={orgs}>
        {(rows) => !rows.length ? <Empty title="No organizers yet">Create an account for your first customer.</Empty> : (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Organizer</th><th>Plan</th><th>Events</th><th>Tickets sold</th><th className="num">Their sales</th><th className="num">Balance</th><th>Last sale</th><th /></tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className={o.status === 'active' ? '' : 'dim'}>
                      <td>
                        <Link to={`/platform/orgs/${o.id}`}><strong>{o.name}</strong></Link>
                        {o.status !== 'active' && <> <Badge status="cancelled">Suspended</Badge></>}
                        {o.pending_payments > 0 && <> <Badge status="sold_out">{o.pending_payments} to review</Badge></>}
                        <div className="muted small">{o.contact_name || o.contact_email}</div>
                      </td>
                      <td className="small">{MODEL_LABEL[o.billing_model]}<div className="muted">{describeTerms(o).split(' · ')[0]}</div></td>
                      <td>{o.events}</td>
                      <td>{o.tickets_sold}</td>
                      <td className="num">{money(o.sales_cents)}</td>
                      <td className="num"><strong>{money(o.billing.balance_cents)}</strong></td>
                      <td className="small muted">{o.last_sale_at ? dateTime(o.last_sale_at) : '—'}</td>
                      <td className="actions">
                        <button className="btn btn-sm" onClick={() => open(o)}>Open</button>
                        <Link className="btn btn-sm" to={`/platform/orgs/${o.id}`}>Manage</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Loadable>
      {creating && <NewOrg onClose={() => setCreating(false)} onSaved={(o) => { orgs.reload(); overview.reload(); nav(`/platform/orgs/${o.id}`); }} />}
    </>
  );
}

function NewOrg({ onClose, onSaved }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: '', contact_name: '', contact_email: '', contact_phone: '', notes: '' });
  const [terms, setTerms] = useState({ billing_model: 'per_ticket', fee_per_ticket_cents: 1000, fee_percent_bp: 0, free_tickets_per_event: 0, monthly_fee_cents: 0, per_event_fee_cents: 0, billing_start: '' });
  const [admin, setAdmin] = useState({ name: '', email: '', password: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setA = (k) => (e) => setAdmin({ ...admin, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const org = await run(() => api('/platform/organizations', { method: 'POST', body: { ...f, ...terms, admin } }), `${f.name} created`);
    onSaved(org);
    onClose();
  };

  return (
    <Modal title="New organizer" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="org-form" disabled={busy}>Create organizer</button></>}>
      <form id="org-form" className="form-grid" onSubmit={submit}>
        <Field label="Organizer name" span={2}><input value={f.name} onChange={set('name')} required placeholder="Grace Church Events" /></Field>
        <Field label="Contact person"><input value={f.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Contact phone"><input value={f.contact_phone} onChange={set('contact_phone')} /></Field>
        <Field label="Contact email" span={2}><input type="email" value={f.contact_email} onChange={set('contact_email')} /></Field>

        <h4 className="span-2">Billing terms</h4>
        <TermsFields value={terms} onChange={setTerms} />

        <h4 className="span-2">Their admin account</h4>
        <p className="span-2 muted small" style={{ marginTop: 0 }}>Send these sign-in details to the organizer. They can add their own staff afterwards.</p>
        <Field label="Admin name"><input value={admin.name} onChange={setA('name')} required /></Field>
        <Field label="Admin email"><input type="email" value={admin.email} onChange={setA('email')} required /></Field>
        <Field label="Temporary password" span={2} hint="At least 8 characters. Ask them to change it after signing in.">
          <input value={admin.password} onChange={setA('password')} required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Notes (only you see these)" span={2}><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}
