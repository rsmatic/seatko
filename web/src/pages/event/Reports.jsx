import { useLoad } from '../../state.jsx';
import { money, PAYMENT_LABEL } from '../../format.js';
import { Empty, Loadable, Meter, Stat } from '../../components/ui.jsx';
import SalesChart from '../../components/SalesChart.jsx';

export default function Reports({ event }) {
  const state = useLoad(`/events/${event.id}/stats`);
  return (
    <Loadable state={state}>
      {({ summary, tiers, by_method, by_cashier, daily, promos }) => (
        <>
          <div className="stats">
            <Stat label="Net revenue" value={money(summary.revenue_cents)} />
            <Stat label="Discounts given" value={money(summary.discount_cents)} />
            <Stat label="Avg. per order" value={money(summary.orders ? summary.revenue_cents / summary.orders : 0)} />
            <Stat label="Attendance" value={`${summary.checked_in} / ${summary.sold}`} />
          </div>

          <section className="card">
            <h3>Revenue · last 60 days</h3>
            <SalesChart rows={daily} days={60} unit="order" />
          </section>

          <section className="card">
            <h3>By tier</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Tier</th><th className="num">Price</th><th>Sold</th><th>Checked in</th><th className="num">Gross (face value)</th></tr></thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.id}>
                      <td><i className="dot" style={{ background: t.color }} /> {t.name}</td>
                      <td className="num">{money(t.price_cents)}</td>
                      <td style={{ minWidth: 160 }}><Meter value={t.sold} max={t.total} color={t.color} /><span className="small">{t.sold} / {t.total}</span></td>
                      <td>{t.checked_in}</td>
                      <td className="num">{money(t.gross_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid-2">
            <section className="card">
              <h3>By payment method</h3>
              {!by_method.length ? <Empty title="No sales yet" /> : (
                <table>
                  <thead><tr><th>Method</th><th>Orders</th><th className="num">Revenue</th></tr></thead>
                  <tbody>{by_method.map((m) => (
                    <tr key={m.payment_method}><td>{PAYMENT_LABEL[m.payment_method]}</td><td>{m.orders}</td><td className="num">{money(m.revenue_cents)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </section>
            <section className="card">
              <h3>By staff</h3>
              {!by_cashier.length ? <Empty title="No sales yet" /> : (
                <table>
                  <thead><tr><th>Sold by</th><th>Orders</th><th className="num">Revenue</th></tr></thead>
                  <tbody>{by_cashier.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td>{c.orders}</td><td className="num">{money(c.revenue_cents)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          </div>

          {promos.length > 0 && (
            <section className="card">
              <h3>Promo code usage</h3>
              <table>
                <thead><tr><th>Code</th><th>Discount</th><th>Used</th></tr></thead>
                <tbody>{promos.map((p) => (
                  <tr key={p.code}><td className="mono">{p.code}</td><td>{p.kind === 'percent' ? `${p.value}%` : money(p.value)}</td><td>{p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}
        </>
      )}
    </Loadable>
  );
}
