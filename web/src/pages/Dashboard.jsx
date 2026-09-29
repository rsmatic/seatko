import { Link } from 'react-router-dom';
import { useLoad } from '../state.jsx';
import { money, dateTime, PAYMENT_LABEL } from '../format.js';
import { Badge, Empty, Loadable, Meter, PageHeader, Stat } from '../components/ui.jsx';
import SalesChart from '../components/SalesChart.jsx';

export default function Dashboard() {
  const state = useLoad('/stats/overview');
  return (
    <>
      <PageHeader title="Dashboard" sub="Sales and attendance across all events">
        <Link to="/events" className="btn btn-primary">Manage events</Link>
      </PageHeader>
      <Loadable state={state}>
        {({ totals, upcoming, daily, recent }) => (
          <>
            <div className="stats">
              <Stat label="Revenue" value={money(totals.revenue_cents)} sub={`${totals.orders} paid order${totals.orders === 1 ? '' : 's'}`} />
              <Stat label="Tickets sold" value={totals.tickets_sold.toLocaleString()} />
              <Stat label="Checked in" value={totals.checked_in.toLocaleString()}
                sub={totals.tickets_sold ? `${Math.round((totals.checked_in / totals.tickets_sold) * 100)}% of sold` : null} />
              <Stat label="Events on sale" value={totals.events_on_sale} />
            </div>

            <div className="grid-2">
              <section className="card">
                <h3>Revenue · last 30 days</h3>
                <SalesChart rows={daily} />
              </section>

              <section className="card">
                <h3>Upcoming events</h3>
                {!upcoming.length && <Empty title="No upcoming events" />}
                <ul className="list">
                  {upcoming.map((e) => (
                    <li key={e.id}>
                      <Link to={`/events/${e.id}`} className="list-row">
                        <div className="grow">
                          <div className="row-title">{e.title}</div>
                          <div className="muted small">{dateTime(e.starts_at)} · {e.venue || 'Venue TBA'}</div>
                          <Meter value={e.summary.sold} max={e.summary.capacity} />
                        </div>
                        <div className="right">
                          <Badge status={e.status} />
                          <div className="small muted">{e.summary.sold}/{e.summary.capacity} sold</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="card">
              <h3>Recent orders</h3>
              {!recent.length ? <Empty title="No orders yet">Sell tickets from an event's Box office tab.</Empty> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Reference</th><th>Event</th><th>Buyer</th><th>Tickets</th><th>Payment</th><th className="num">Total</th><th>Status</th><th>When</th></tr></thead>
                    <tbody>
                      {recent.map((o) => (
                        <tr key={o.id}>
                          <td><Link to={`/events/${o.event_id}/orders?order=${o.id}`}>{o.reference}</Link></td>
                          <td>{o.event_title}</td>
                          <td>{o.buyer_name}</td>
                          <td>{o.ticket_count}</td>
                          <td>{PAYMENT_LABEL[o.payment_method]}</td>
                          <td className="num">{money(o.total_cents)}</td>
                          <td><Badge status={o.status} /></td>
                          <td className="muted small">{dateTime(o.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </Loadable>
    </>
  );
}
