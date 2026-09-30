import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../../api.js';
import { useAction, useApp, MANAGE } from '../../state.jsx';
import { dateLong, dateTime, money, timeOnly } from '../../format.js';
import { Meter, Stat, confirmAction } from '../../components/ui.jsx';
import EventForm from '../../components/EventForm.jsx';

export default function Overview({ event, reloadEvent }) {
  const { can } = useApp();
  const nav = useNavigate();
  const [run, busy] = useAction();
  const [editing, setEditing] = useState(false);
  const fileRef = useRef(null);
  const s = event.summary;
  const manage = can(...MANAGE);

  const setStatus = (status) => run(() => api(`/events/${event.id}`, { method: 'PATCH', body: { status } }), 'Status updated').then(reloadEvent);
  const uploadPoster = async (file) => {
    const fd = new FormData();
    fd.append('poster', file);
    await run(() => api(`/events/${event.id}/poster`, { method: 'POST', body: fd }), 'Poster uploaded');
    reloadEvent();
  };
  const duplicate = async () => {
    const copy = await run(() => api(`/events/${event.id}/duplicate`, { method: 'POST' }), 'Event duplicated as a draft');
    nav(`/events/${copy.id}`);
  };
  const remove = async () => {
    if (!confirmAction(`Delete "${event.title}"? This cannot be undone.`)) return;
    await run(() => api(`/events/${event.id}`, { method: 'DELETE' }), 'Event deleted');
    nav('/events');
  };

  return (
    <>
      <div className="stats">
        <Stat label="Sold" value={`${s.sold} / ${s.capacity}`} sub={s.capacity ? `${Math.round((s.sold / s.capacity) * 100)}% of capacity` : 'No capacity yet'} />
        {manage && <Stat label="Revenue" value={money(s.revenue_cents)} sub={`${s.orders} orders · ${money(s.discount_cents)} discounts`} />}
        <Stat label="Checked in" value={s.checked_in} sub={s.sold ? `${Math.round((s.checked_in / s.sold) * 100)}% of sold` : null} />
        <Stat label="Remaining" value={Math.max(0, s.capacity - s.sold)} />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="split"><h3>Details</h3>
            {manage && <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>}
          </div>
          <dl className="details">
            <dt>Date</dt><dd>{dateLong(event.starts_at)}</dd>
            <dt>Show</dt><dd>{timeOnly(event.starts_at)}{event.doors_at && ` · doors ${timeOnly(event.doors_at)}`}</dd>
            <dt>Venue</dt><dd>{event.venue || '—'}{event.address && <div className="muted small">{event.address}</div>}</dd>
            <dt>Per order</dt><dd>Max {event.max_per_order} tickets</dd>
            <dt>Updated</dt><dd>{dateTime(event.updated_at)}</dd>
          </dl>
          {event.description && <p className="pre">{event.description}</p>}

          {manage && (
            <>
              <h4>Status</h4>
              <div className="btn-row">
                {event.status === 'draft' && <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('on_sale')}>Put on sale</button>}
                {(event.status === 'on_sale' || event.status === 'sold_out') && <button className="btn" disabled={busy} onClick={() => setStatus('closed')}>Close sales</button>}
                {event.status === 'closed' && <button className="btn" disabled={busy} onClick={() => setStatus('on_sale')}>Reopen sales</button>}
                {event.status !== 'cancelled' && <button className="btn btn-danger-ghost" disabled={busy}
                  onClick={() => confirmAction('Cancel this event? Sales stop; existing tickets stay until refunded.') && setStatus('cancelled')}>Cancel event</button>}
                {event.status === 'cancelled' && <button className="btn" disabled={busy} onClick={() => setStatus('draft')}>Restore as draft</button>}
              </div>
              <h4>Website embed</h4>
              <p className="small muted">
                {!event.show_on_website ? 'Hidden. The band site keeps its placeholder text.'
                  : event.status === 'draft' ? 'Will appear once the event is put on sale.'
                  : 'Visible on the band site (updates within a minute).'}
              </p>
              <div className="btn-row">
                <button className="btn" disabled={busy}
                  onClick={() => run(() => api(`/events/${event.id}`, { method: 'PATCH', body: { show_on_website: !event.show_on_website } }),
                    event.show_on_website ? 'Hidden from website' : 'Shown on website').then(reloadEvent)}>
                  {event.show_on_website ? 'Hide from website' : 'Show on website'}
                </button>
              </div>

              <h4>More</h4>
              <div className="btn-row">
                <button className="btn" onClick={duplicate} disabled={busy}>Duplicate event</button>
                {s.orders === 0 && <button className="btn btn-danger-ghost" onClick={remove} disabled={busy}>Delete</button>}
              </div>
            </>
          )}
        </section>

        <section className="card">
          <div className="split"><h3>Poster</h3>
            {manage && <>
              <button className="btn btn-sm" onClick={() => fileRef.current.click()}>{event.poster ? 'Replace' : 'Upload'}</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadPoster(e.target.files[0])} />
            </>}
          </div>
          {event.poster
            ? <img className="poster" src={assetUrl(`/uploads/${event.poster}`)} alt={`${event.title} poster`} />
            : <div className="poster poster-empty">No poster yet</div>}

          <h3 className="mt">Ticket tiers</h3>
          {!event.tiers.length && <p className="muted">No prices yet. {manage && 'Add them in the Pricing tab.'}</p>}
          {event.tiers.map((t) => (
            <div key={t.id} className="tier-line">
              <div className="split">
                <span><i className="dot" style={{ background: t.color }} /> {t.name} {!t.active && <span className="muted small">(inactive)</span>}</span>
                <span>{money(t.price_cents)}</span>
              </div>
              <Meter value={t.sold} max={t.total} color={t.color} />
              <div className="muted small">{t.sold} / {t.total} sold · {t.kind === 'ga' ? 'General admission' : 'Reserved seating'}</div>
            </div>
          ))}
        </section>
      </div>
      {editing && <EventForm event={event} onClose={() => setEditing(false)} onSaved={reloadEvent} />}
    </>
  );
}
