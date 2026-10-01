import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction, useApp, useLoad, MANAGE } from '../../state.jsx';
import { dateTime, money, PAYMENT_LABEL } from '../../format.js';
import { Badge, Empty, Loadable, Modal, confirmAction } from '../../components/ui.jsx';
import EmailTickets from '../../components/EmailTickets.jsx';

export default function Orders({ event, reloadEvent }) {
  const [q, setQ] = useState('');
  const [params, setParams] = useSearchParams();
  const state = useLoad(`/events/${event.id}/orders?q=${encodeURIComponent(q)}`);
  const openId = params.get('order');

  return (
    <section className="card">
      <div className="filters">
        <input type="search" placeholder="Search reference, buyer, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Loadable state={state}>
        {(orders) => !orders.length ? <Empty title="No orders found" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Buyer</th><th>Tickets</th><th>Payment</th><th className="num">Total</th><th>Status</th><th>Sold by</th><th>When</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => setParams({ order: o.id })}>
                    <td className="mono">{o.reference}</td>
                    <td>{o.buyer_name}<div className="muted small">{o.buyer_email || o.buyer_phone}</div></td>
                    <td>{o.ticket_count}</td>
                    <td>{PAYMENT_LABEL[o.payment_method]}{o.payment_ref && <div className="muted small">{o.payment_ref}</div>}</td>
                    <td className="num">{money(o.total_cents)}</td>
                    <td><Badge status={o.status} /></td>
                    <td className="small">{o.created_by_name}</td>
                    <td className="small muted">{dateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loadable>
      {openId && <OrderModal id={openId} onClose={() => setParams({})} onChanged={() => { state.reload(); reloadEvent(); }} />}
    </section>
  );
}

function OrderModal({ id, onClose, onChanged }) {
  const { can } = useApp();
  const state = useLoad(`/orders/${id}`);
  const [run, busy] = useAction();

  const refund = async () => {
    const o = state.data;
    if (!confirmAction(`Refund ${o.reference} (${money(o.total_cents)})? All ${o.tickets.length} tickets will be voided and seats released.`)) return;
    const reason = window.prompt('Reason (optional)') ?? '';
    const updated = await run(() => api(`/orders/${id}/refund`, { method: 'POST', body: { reason } }), 'Order refunded');
    state.setData(updated);
    onChanged();
  };

  return (
    <Modal title="Order" onClose={onClose} wide
      footer={state.data && <>
        {can(...MANAGE) && state.data.status === 'paid' && <button className="btn btn-danger-ghost" onClick={refund} disabled={busy}>Refund order</button>}
        <Link className="btn btn-primary" to={`/tickets/${state.data.tickets.filter((t) => t.status !== 'void').map((t) => t.code).join(',')}`}>Print tickets</Link>
      </>}>
      <Loadable state={state}>
        {(o) => (
          <>
            <dl className="details">
              <dt>Reference</dt><dd className="mono">{o.reference} <Badge status={o.status} /></dd>
              <dt>Buyer</dt><dd>{o.buyer_name}<div className="muted small">{[o.buyer_email, o.buyer_phone].filter(Boolean).join(' · ')}</div></dd>
              <dt>Payment</dt><dd>{PAYMENT_LABEL[o.payment_method]}{o.payment_ref && ` · ${o.payment_ref}`}</dd>
              <dt>Amount</dt><dd>{money(o.subtotal_cents)}{o.discount_cents > 0 && <> − {money(o.discount_cents)} {o.promo_code && `(${o.promo_code})`}</>} = <strong>{money(o.total_cents)}</strong></dd>
              <dt>Sold by</dt><dd>{o.created_by_name} · {dateTime(o.created_at)}</dd>
              {o.notes && <><dt>Notes</dt><dd>{o.notes}</dd></>}
            </dl>
            {o.status === 'paid' && <EmailTickets order={o} onSent={(updated) => state.setData(updated)} />}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Code</th><th>Seat / tier</th><th>Holder</th><th className="num">Price</th><th>Status</th></tr></thead>
                <tbody>
                  {o.tickets.map((t) => (
                    <tr key={t.id}>
                      <td><Link className="mono" to={`/tickets/${t.code}`}>{t.code}</Link></td>
                      <td>{t.seat_label ?? t.tier_name}</td>
                      <td>{t.holder_name}</td>
                      <td className="num">{money(t.price_cents)}</td>
                      <td><Badge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Loadable>
    </Modal>
  );
}
