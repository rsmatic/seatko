import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../../api.js';
import { useAction, useApp, useLoad, MANAGE, SELL } from '../../state.jsx';
import { dateTime, money } from '../../format.js';
import { Badge, Empty, Loadable, confirmAction } from '../../components/ui.jsx';

export default function Tickets({ event, reloadEvent }) {
  const { can } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const state = useLoad(`/events/${event.id}/tickets?q=${encodeURIComponent(q)}&status=${status}`);
  const [run] = useAction();

  const act = async (t, path, msg, body) => {
    const updated = await run(() => api(`/tickets/${t.id}/${path}`, { method: 'POST', body: body ?? {} }), msg);
    state.setData((rows) => rows.map((r) => (r.id === t.id ? updated : r)));
    reloadEvent();
  };

  const rename = async (t) => {
    const name = window.prompt('Ticket holder name', t.holder_name);
    if (!name || name === t.holder_name) return;
    const updated = await run(() => api(`/tickets/${t.id}`, { method: 'PATCH', body: { holder_name: name } }), 'Holder updated');
    state.setData((rows) => rows.map((r) => (r.id === t.id ? updated : r)));
  };

  const exportCsv = () => run(() => download(`/events/${event.id}/tickets.csv?status=${status}`, `${event.title}-attendees.csv`));

  return (
    <section className="card">
      <div className="filters">
        <input type="search" placeholder="Search code, holder, buyer, seat, order…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All tickets</option>
          <option value="valid">Valid (not yet scanned)</option>
          <option value="used">Checked in</option>
          <option value="void">Void</option>
        </select>
        {can(...MANAGE) && <button className="btn" onClick={exportCsv}>Export CSV</button>}
      </div>
      <Loadable state={state}>
        {(rows) => !rows.length ? <Empty title="No tickets found" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Seat / tier</th><th>Holder</th><th className="num">Price</th><th>Order</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td><Link className="mono" to={`/tickets/${t.code}`}>{t.code}</Link></td>
                    <td><i className="dot" style={{ background: t.tier_color ?? '#666' }} /> {t.seat_label ?? t.tier_name}{t.seat_label && <div className="muted small">{t.tier_name}</div>}</td>
                    <td>{t.holder_name}</td>
                    <td className="num">{money(t.price_cents)}</td>
                    <td className="small">{can(...SELL) ? <Link to={`/events/${event.id}/orders?order=${t.order_id}`}>{t.order_reference}</Link> : t.order_reference}</td>
                    <td><Badge status={t.status} />{t.checked_in_at && <div className="muted small">{dateTime(t.checked_in_at)}</div>}</td>
                    <td className="actions">
                      {can(...SELL) && t.status !== 'void' && <button className="btn btn-sm" onClick={() => rename(t)}>Rename</button>}
                      {can(...MANAGE) && t.status === 'used' && <button className="btn btn-sm" onClick={() => act(t, 'undo-checkin', 'Check-in undone')}>Undo check-in</button>}
                      {can(...MANAGE) && t.status !== 'void' && (
                        <button className="btn btn-sm btn-danger-ghost"
                          onClick={() => confirmAction(`Void ticket ${t.code}? Its seat will be released for sale.`) && act(t, 'void', 'Ticket voided')}>Void</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loadable>
    </section>
  );
}
