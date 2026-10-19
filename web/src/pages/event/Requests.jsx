import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApp, useLoad } from '../../state.jsx';
import { dateTime, money } from '../../format.js';
import { Badge, Empty, Field, Loadable, Modal, Tabs } from '../../components/ui.jsx';
import { ProofImage } from '../../components/BillingBits.jsx';
import SeatMap from '../../components/SeatMap.jsx';

const METHOD = { gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer', other: 'Other' };
const STATUS_BADGE = { pending: ['sold_out', 'Pending'], approved: ['paid', 'Approved'], rejected: ['void', 'Rejected'] };

const itemsText = (items) => items.map((i) => `${i.qty} × ${i.tier_name}`).join(', ');

export default function Requests({ event, reloadEvent }) {
  const [status, setStatus] = useState('pending');
  const [params, setParams] = useSearchParams();
  const state = useLoad(`/events/${event.id}/requests${status ? `?status=${status}` : ''}`);
  const openId = params.get('request');

  return (
    <section className="card">
      <p className="muted small" style={{ marginTop: 0 }}>
        Ticket requests sent from your website with proof of payment. No seats are held until you approve.
        Approving assigns seats, issues the tickets and emails them to the buyer.
      </p>
      <Tabs value={status} onChange={setStatus}
        tabs={[{ key: 'pending', label: 'To review' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }, { key: '', label: 'All' }]} />
      <Loadable state={state}>
        {(rows) => !rows.length ? <Empty title={status === 'pending' ? 'Nothing to review' : 'No requests'}>Requests from your website appear here.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Submitted</th><th>Buyer</th><th>Tickets</th><th className="num">Amount</th><th>Payment</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setParams({ request: r.id })}>
                    <td className="small">{dateTime(r.created_at)}<div className="mono muted">{r.reference}</div></td>
                    <td>{r.buyer_name}<div className="muted small">{r.buyer_email} · {r.buyer_phone}</div></td>
                    <td className="small">{itemsText(r.items)}</td>
                    <td className="num">{money(r.amount_cents)}</td>
                    <td className="small">{METHOD[r.payment_method] ?? r.payment_method}{r.payment_ref && <div className="mono muted">{r.payment_ref}</div>}</td>
                    <td><Badge status={STATUS_BADGE[r.status][0]}>{STATUS_BADGE[r.status][1]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loadable>
      {openId && <ReviewModal id={openId} event={event} onClose={() => setParams({})} onChanged={() => { state.reload(); reloadEvent(); }} />}
    </section>
  );
}

/**
 * Pick seats for each requested seated tier: the first row (front first) with enough adjacent
 * available seats, otherwise the first available ones.
 */
function suggestSeats(seats, sections, items) {
  const order = new Map(sections.map((s, i) => [s.id, i]));
  const chosen = new Set();
  for (const item of items.filter((i) => i.kind === 'seated')) {
    const free = seats
      .filter((s) => s.tier_id === item.tier_id && s.status === 'available' && !chosen.has(s.id))
      .sort((a, b) => (order.get(a.section_id) - order.get(b.section_id)) || (a.row_index - b.row_index) || (a.number - b.number));
    let pick = null;
    for (let i = 0; i + item.qty <= free.length && !pick; i++) {
      const run = free.slice(i, i + item.qty);
      const sameRow = run.every((s) => s.section_id === run[0].section_id && s.row_index === run[0].row_index);
      const adjacent = run.every((s, k) => k === 0 || s.number === run[k - 1].number + 1);
      if (sameRow && adjacent) pick = run;
    }
    (pick ?? free.slice(0, item.qty)).forEach((s) => chosen.add(s.id));
  }
  return chosen;
}

function ReviewModal({ id, event, onClose, onChanged }) {
  const { settings, toast } = useApp();
  const state = useLoad(`/requests/${id}`);
  const r = state.data;
  const pending = r?.status === 'pending';
  const map = useLoad(pending ? `/events/${event.id}/seatmap` : null);
  const [selected, setSelected] = useState(new Set());
  const [ga, setGa] = useState({});
  const [sendEmail, setSendEmail] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();

  // Pre-fill: suggested seats and the requested general-admission quantities.
  useEffect(() => {
    if (!r || !map.data) return;
    setSelected(suggestSeats(map.data.seats, map.data.sections, r.items));
    setGa(Object.fromEntries(r.items.filter((i) => i.kind === 'ga').map((i) => [i.tier_id, i.qty])));
  }, [r?.id, map.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const tierById = useMemo(() => new Map(event.tiers.map((t) => [t.id, t])), [event.tiers]);
  const picked = useMemo(() => {
    const counts = {};
    for (const s of map.data?.seats ?? []) if (selected.has(s.id)) counts[s.tier_id] = (counts[s.tier_id] || 0) + 1;
    for (const [tid, q] of Object.entries(ga)) if (q) counts[tid] = (counts[tid] || 0) + q;
    return counts;
  }, [selected, ga, map.data]);
  const total = Object.entries(picked).reduce((a, [tid, q]) => a + q * (tierById.get(Number(tid))?.price_cents ?? 0), 0);
  const mismatch = r ? r.items.some((i) => (picked[i.tier_id] || 0) !== i.qty) || Object.keys(picked).some((tid) => !r.items.find((i) => i.tier_id === Number(tid))) : false;

  const approve = async () => {
    const body = {
      seat_ids: [...selected],
      ga: Object.entries(ga).filter(([, q]) => q > 0).map(([tier_id, qty]) => ({ tier_id: Number(tier_id), qty })),
      send_email: sendEmail,
    };
    const out = await run(() => api(`/requests/${id}/approve`, { method: 'POST', body }), 'Request approved');
    if (out.email_error) toast(`Tickets issued, but the email failed: ${out.email_error}`, 'error');
    else if (sendEmail) toast(`Tickets emailed to ${r.buyer_email}`);
    state.setData(out.request);
    onChanged();
  };
  const reject = async () => {
    const out = await run(() => api(`/requests/${id}/reject`, { method: 'POST', body: { note: reason, send_email: sendEmail } }), 'Request rejected');
    if (out.email_error) toast(`Rejected, but the email failed: ${out.email_error}`, 'error');
    state.setData(out.request);
    setRejecting(false);
    onChanged();
  };

  const canEmail = settings?.email_enabled;
  return (
    <Modal title={r ? `Request ${r.reference}` : 'Request'} onClose={onClose} wide
      footer={r && pending && (rejecting ? (
        <>
          <button className="btn" onClick={() => setRejecting(false)} disabled={busy}>Back</button>
          <button className="btn btn-danger" onClick={reject} disabled={busy}>{busy ? 'Rejecting…' : 'Reject request'}</button>
        </>
      ) : (
        <>
          <button className="btn btn-danger-ghost" onClick={() => setRejecting(true)} disabled={busy}>Reject…</button>
          <button className="btn btn-primary" onClick={approve} disabled={busy || !Object.values(picked).some(Boolean)}>
            {busy ? 'Approving…' : `Approve${sendEmail && canEmail ? ' & email tickets' : ''}`}
          </button>
        </>
      ))}>
      <Loadable state={state}>
        {(req) => (
          <>
            <div className="grid-2 review-grid">
              <div>
                <dl className="details">
                  <dt>Status</dt><dd><Badge status={STATUS_BADGE[req.status][0]}>{STATUS_BADGE[req.status][1]}</Badge>
                    {req.reviewed_at && <div className="muted small">{req.reviewed_by_name} · {dateTime(req.reviewed_at)}</div>}</dd>
                  <dt>Buyer</dt><dd><strong>{req.buyer_name}</strong><div className="small">{req.buyer_email}</div><div className="small">{req.buyer_phone}</div></dd>
                  <dt>Requested</dt><dd>{itemsText(req.items)}</dd>
                  <dt>Amount</dt><dd><strong>{money(req.amount_cents)}</strong></dd>
                  <dt>Paid via</dt><dd>{METHOD[req.payment_method] ?? req.payment_method}{req.payment_ref && <> · <span className="mono">{req.payment_ref}</span></>}</dd>
                  <dt>Submitted</dt><dd>{dateTime(req.created_at)}</dd>
                  {req.note && <><dt>Buyer note</dt><dd>{req.note}</dd></>}
                  {req.review_note && <><dt>{req.status === 'rejected' ? 'Reason' : 'Note'}</dt><dd>{req.review_note}</dd></>}
                  {req.order_id && <><dt>Order</dt><dd><Link to={`/events/${event.id}/orders?order=${req.order_id}`}>{req.order_reference}</Link></dd></>}
                </dl>
              </div>
              <div>
                <div className="field-label">Proof of payment</div>
                {req.proof ? <ProofImage path={`/requests/${req.id}/proof`} /> : <span className="muted small">No file</span>}
              </div>
            </div>

            {pending && !rejecting && (
              <>
                <h4>Assign seats</h4>
                <p className="small muted" style={{ marginTop: 0 }}>
                  Suggested seats are pre-selected. Click seats to change them. Check the payment against your GCash or bank before approving.
                </p>
                {event.tiers.filter((t) => t.kind === 'ga' && (ga[t.id] || req.items.some((i) => i.tier_id === t.id))).map((t) => (
                  <div key={t.id} className="ga-line">
                    <div className="grow"><i className="dot" style={{ background: t.color }} /> <strong>{t.name}</strong> · {money(t.price_cents)}</div>
                    <div className="stepper">
                      <button type="button" className="btn btn-sm" onClick={() => setGa({ ...ga, [t.id]: Math.max(0, (ga[t.id] || 0) - 1) })} aria-label={`Fewer ${t.name}`}>−</button>
                      <span>{ga[t.id] || 0}</span>
                      <button type="button" className="btn btn-sm" onClick={() => setGa({ ...ga, [t.id]: (ga[t.id] || 0) + 1 })} aria-label={`More ${t.name}`}>+</button>
                    </div>
                  </div>
                ))}
                <Loadable state={map}>
                  {({ sections, seats }) => sections.length > 0 && (
                    <SeatMap sections={sections} seats={seats} tiers={event.tiers} selected={selected} onChange={setSelected} mode="sell" />
                  )}
                </Loadable>
                <div className={`review-total ${mismatch ? 'warn' : ''}`}>
                  <span>Selected: {Object.entries(picked).filter(([, q]) => q).map(([tid, q]) => `${q} × ${tierById.get(Number(tid))?.name}`).join(', ') || 'nothing yet'}</span>
                  <strong>{money(total)}</strong>
                </div>
                {mismatch && <div className="small review-warn">This doesn't match what they requested ({itemsText(req.items)}). That's fine if you agreed on a change.</div>}
                {total !== req.amount_cents && Object.values(picked).some(Boolean) && (
                  <div className="small review-warn">Total differs from the amount they paid ({money(req.amount_cents)}).</div>
                )}
              </>
            )}

            {pending && rejecting && (
              <Field label="Reason (sent to the buyer)">
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We couldn't find this reference number in our GCash. Please send a clearer screenshot." autoFocus />
              </Field>
            )}

            {pending && canEmail && (
              <label className="check mt">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                <span>Email the buyer ({req.buyer_email})</span>
              </label>
            )}
            {req.status === 'approved' && req.order_id && (
              <p className="mt"><Link className="btn btn-sm" to={`/events/${event.id}/orders?order=${req.order_id}`}>Open order, resend or print tickets</Link></p>
            )}
          </>
        )}
      </Loadable>
    </Modal>
  );
}
