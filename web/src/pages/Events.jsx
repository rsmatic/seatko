import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { assetUrl } from '../api.js';
import { useApp, useLoad, MANAGE } from '../state.jsx';
import { dateTime, money, STATUS_LABEL } from '../format.js';
import { Badge, Empty, Loadable, Meter, PageHeader } from '../components/ui.jsx';
import EventForm from '../components/EventForm.jsx';

export default function Events() {
  const { can } = useApp();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const state = useLoad(`/events?status=${status}&q=${encodeURIComponent(q)}`);

  return (
    <>
      <PageHeader title="Events" sub="Concerts and shows, with their pricing, seating and sales">
        {can(...MANAGE) && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New event</button>}
      </PageHeader>

      <div className="filters">
        <input type="search" placeholder="Search title, artist, venue…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).slice(0, 5).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <Loadable state={state}>
        {(events) => !events.length ? (
          <Empty title="No events yet">{can(...MANAGE) ? 'Create your first event, like a POIMEN concert.' : 'Nothing to show.'}</Empty>
        ) : (
          <div className="event-grid">
            {events.map((e) => (
              <Link key={e.id} to={`/events/${e.id}`} className="event-card">
                <div className="event-poster" style={e.poster ? { backgroundImage: `url(${assetUrl(`/uploads/${e.poster}`)})` } : undefined}>
                  {!e.poster && <span>{e.artist || e.title}</span>}
                  <Badge status={e.status} />
                </div>
                <div className="event-body">
                  <div className="muted small">{e.artist}</div>
                  <div className="row-title">{e.title}</div>
                  <div className="muted small">{dateTime(e.starts_at)}</div>
                  <div className="muted small">{e.venue || 'Venue TBA'}</div>
                  <Meter value={e.summary.sold} max={e.summary.capacity} />
                  <div className="split small">
                    <span>{e.summary.sold} / {e.summary.capacity} sold</span>
                    {can(...MANAGE) && <strong>{money(e.summary.revenue_cents)}</strong>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Loadable>

      {creating && <EventForm onClose={() => setCreating(false)} onSaved={(ev) => nav(`/events/${ev.id}/pricing`)} />}
    </>
  );
}
