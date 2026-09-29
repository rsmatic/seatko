import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qrUrl } from '../../api.js';
import { useAction, useApp, useLoad, MANAGE } from '../../state.jsx';
import { money, PAYMENT_LABEL } from '../../format.js';
import { Field, Loadable, Modal } from '../../components/ui.jsx';
import SeatMap from '../../components/SeatMap.jsx';

const EMPTY_BUYER = { buyer_name: '', buyer_email: '', buyer_phone: '', payment_method: 'cash', payment_ref: '', notes: '' };

export default function BoxOffice({ event, reloadEvent }) {
  const { can, settings } = useApp();
  const map = useLoad(`/events/${event.id}/seatmap`);
  const [selected, setSelected] = useState(new Set());
  const [ga, setGa] = useState({});
  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [done, setDone] = useState(null);
  const [run, busy] = useAction();

  const gaTiers = event.tiers.filter((t) => t.kind === 'ga' && t.active);
  const cart = useMemo(() => ({
    seat_ids: [...selected],
    ga: Object.entries(ga).filter(([, q]) => q > 0).map(([tier_id, qty]) => ({ tier_id: Number(tier_id), qty })),
  }), [selected, ga]);
  const count = cart.seat_ids.length + cart.ga.reduce((a, l) => a + l.qty, 0);

  useEffect(() => {
    if (!count) { setQuote(null); setQuoteError(''); return; }
    const body = { ...cart, promo_code: promo || undefined, payment_method: buyer.payment_method };
    let live = true;
    const t = setTimeout(() => {
      api(`/events/${event.id}/quote`, { method: 'POST', body })
        .then((q) => { if (live) { setQuote(q); setQuoteError(''); } })
        .catch((e) => { if (live) { setQuote(null); setQuoteError(e.message); } });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [cart, promo, buyer.payment_method, count, event.id]);

  const set = (k) => (e) => setBuyer({ ...buyer, [k]: e.target.value });
  const closed = ['cancelled', 'closed'].includes(event.status);

  const submit = async (e) => {
    e.preventDefault();
    const order = await run(
      () => api(`/events/${event.id}/orders`, { method: 'POST', body: { ...cart, ...buyer, promo_code: promo || undefined } }),
      'Tickets issued',
    );
    setDone(order);
    setSelected(new Set());
    setGa({});
    setBuyer(EMPTY_BUYER);
    setPromo('');
    setPromoInput('');
    map.reload();
    reloadEvent();
  };

  if (closed) return <div className="alert">Sales are {event.status} for this event.</div>;

  return (
    <div className="boxoffice">
      <div className="bo-main">
        {event.status === 'draft' && <div className="alert">This event is a draft. Only complimentary tickets can be issued until it's put on sale.</div>}
        {gaTiers.length > 0 && (
          <section className="card">
            <h3>General admission</h3>
            {gaTiers.map((t) => {
              const left = t.total - t.sold;
              const q = ga[t.id] || 0;
              return (
                <div key={t.id} className="ga-line">
                  <div className="grow"><i className="dot" style={{ background: t.color }} /> <strong>{t.name}</strong> · {money(t.price_cents)}
                    <div className="muted small">{left} left</div></div>
                  <div className="stepper">
                    <button type="button" className="btn btn-sm" onClick={() => setGa({ ...ga, [t.id]: Math.max(0, q - 1) })} disabled={!q} aria-label={`Fewer ${t.name}`}>−</button>
                    <span aria-live="polite">{q}</span>
                    <button type="button" className="btn btn-sm" onClick={() => setGa({ ...ga, [t.id]: Math.min(left, q + 1) })} disabled={q >= left} aria-label={`More ${t.name}`}>+</button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
        <section className="card">
          <h3>Pick seats</h3>
          <Loadable state={map}>
            {({ sections, seats }) => sections.length
              ? <SeatMap sections={sections} seats={seats} tiers={event.tiers} selected={selected} onChange={setSelected} mode="sell" />
              : <p className="muted">This event has no reserved seating.</p>}
          </Loadable>
        </section>
      </div>

      <form className="card bo-cart" onSubmit={submit}>
        <h3>Order</h3>
        {!count && <p className="muted">Select seats or add general admission tickets.</p>}
        {quote && (
          <ul className="cart-items">
            {quote.items.map((i, idx) => (
              <li key={idx} className="split small">
                <span>{i.seat_label ?? i.tier_name}<span className="muted"> · {i.tier_name}</span></span>
                <span>{money(i.price_cents)}</span>
              </li>
            ))}
          </ul>
        )}
        {quoteError && <div className="alert alert-error">{quoteError}</div>}

        <div className="promo">
          <input placeholder="Promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} disabled={buyer.payment_method === 'comp'} />
          {promo
            ? <button type="button" className="btn btn-sm" onClick={() => { setPromo(''); setPromoInput(''); }}>Remove</button>
            : <button type="button" className="btn btn-sm" onClick={() => setPromo(promoInput.trim())} disabled={!promoInput.trim()}>Apply</button>}
        </div>

        {quote && (
          <div className="totals">
            <div className="split"><span>Subtotal</span><span>{money(quote.subtotal_cents)}</span></div>
            {quote.discount_cents > 0 && <div className="split"><span>Discount{quote.promo ? ` (${quote.promo.code})` : ''}</span><span>−{money(quote.discount_cents)}</span></div>}
            <div className="split total"><span>Total</span><span>{money(quote.total_cents)}</span></div>
          </div>
        )}

        <Field label="Buyer name"><input value={buyer.buyer_name} onChange={set('buyer_name')} required /></Field>
        <div className="form-grid">
          <Field label="Email"><input type="email" value={buyer.buyer_email} onChange={set('buyer_email')} /></Field>
          <Field label="Phone"><input value={buyer.buyer_phone} onChange={set('buyer_phone')} /></Field>
          <Field label="Payment">
            <select value={buyer.payment_method} onChange={set('payment_method')}>
              {Object.entries(PAYMENT_LABEL).filter(([k]) => k !== 'comp' || can(...MANAGE)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Payment ref."><input value={buyer.payment_ref} onChange={set('payment_ref')} placeholder="GCash ref no." /></Field>
        </div>
        <Field label="Notes"><input value={buyer.notes} onChange={set('notes')} /></Field>
        <button className="btn btn-primary btn-block" disabled={!quote || busy}>
          {busy ? 'Issuing…' : quote ? `Issue ${count} ticket${count === 1 ? '' : 's'} · ${money(quote.total_cents)}` : 'Issue tickets'}
        </button>
      </form>

      {done && <OrderDone order={done} v={settings?.v} onClose={() => setDone(null)} />}
    </div>
  );
}

function OrderDone({ order, v, onClose }) {
  const codes = order.tickets.map((t) => t.code).join(',');
  return (
    <Modal title={`Order ${order.reference}`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>New sale</button><Link className="btn btn-primary" to={`/tickets/${codes}`}>Print / download tickets</Link></>}>
      <p>{order.tickets.length} ticket(s) issued to <strong>{order.buyer_name}</strong> · {money(order.total_cents)} via {PAYMENT_LABEL[order.payment_method]}</p>
      <div className="done-grid">
        {order.tickets.map((t) => (
          <Link to={`/tickets/${t.code}`} key={t.id} className="done-ticket">
            <img src={qrUrl(t.code, v)} alt={`QR for ${t.code}`} width="120" height="120" />
            <div className="mono">{t.code}</div>
            <div className="small">{t.seat_label ?? t.tier_name}</div>
          </Link>
        ))}
      </div>
    </Modal>
  );
}
