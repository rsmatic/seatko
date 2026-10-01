import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useLoad } from '../../state.jsx';
import { dateTime, money } from '../../format.js';
import { Empty, Loadable, Modal, PageHeader, Tabs } from '../../components/ui.jsx';
import { BILL_METHOD_LABEL, ProofImage } from '../../components/BillingBits.jsx';
import { PayStatus } from '../Billing.jsx';

export default function PlatformPayments() {
  const [status, setStatus] = useState('pending');
  const state = useLoad(`/platform/payments?status=${status}`);
  return (
    <>
      <PageHeader title="Payments" sub="Payments organizers submitted. Check your GCash or bank, then confirm or reject." />
      <Tabs value={status} onChange={setStatus}
        tabs={[{ key: 'pending', label: 'To review' }, { key: 'approved', label: 'Confirmed' }, { key: 'rejected', label: 'Rejected' }, { key: '', label: 'All' }]} />
      <Loadable state={state}>
        {(rows) => !rows.length ? <Empty title={status === 'pending' ? 'Nothing to review' : 'No payments'} /> : (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Submitted</th><th>Organizer</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="small">{dateTime(p.created_at)}<div className="muted">{p.created_by_name}</div></td>
                      <td><Link to={`/platform/orgs/${p.org_id}`}>{p.org_name}</Link></td>
                      <td>{BILL_METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="mono small">{p.reference || '—'}{p.note && <div className="muted">{p.note}</div>}</td>
                      <td className="num"><strong>{money(p.amount_cents)}</strong></td>
                      <td><PayStatus p={p} />{p.reviewed_at && <div className="muted small">{p.reviewed_by_name} · {dateTime(p.reviewed_at)}</div>}</td>
                      <td className="actions">
                        <ProofButton p={p} />
                        {p.status === 'pending' && <ReviewButtons p={p} onDone={state.reload} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Loadable>
    </>
  );
}

export function ProofButton({ p }) {
  const [open, setOpen] = useState(false);
  if (!p.proof) return null;
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>Screenshot</button>
      {open && (
        <Modal title={`Payment · ${money(p.amount_cents)}${p.reference ? ` · ${p.reference}` : ''}`} onClose={() => setOpen(false)}>
          <ProofImage path={`/platform/payments/${p.id}/proof`} />
        </Modal>
      )}
    </>
  );
}

export function ReviewButtons({ p, onDone }) {
  const [run, busy] = useAction();
  const review = async (action) => {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Why is it rejected? (shown to the organizer)') ?? null;
      if (note === null) return;
    }
    await run(() => api(`/platform/payments/${p.id}/${action}`, { method: 'POST', body: { note } }),
      action === 'approve' ? `${money(p.amount_cents)} confirmed` : 'Payment rejected');
    onDone();
  };
  return (
    <>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => review('approve')}>Confirm</button>
      <button className="btn btn-sm btn-danger-ghost" disabled={busy} onClick={() => review('reject')}>Reject</button>
    </>
  );
}
