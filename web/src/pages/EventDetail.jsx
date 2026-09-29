import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, useLoad, MANAGE, SELL } from '../state.jsx';
import { dateTime } from '../format.js';
import { Badge, Loadable, Tabs } from '../components/ui.jsx';
import Overview from './event/Overview.jsx';
import Pricing from './event/Pricing.jsx';
import Seating from './event/Seating.jsx';
import BoxOffice from './event/BoxOffice.jsx';
import Orders from './event/Orders.jsx';
import Tickets from './event/Tickets.jsx';
import Promos from './event/Promos.jsx';
import Reports from './event/Reports.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', component: Overview },
  { key: 'sell', label: 'Box office', component: BoxOffice, roles: SELL },
  { key: 'pricing', label: 'Pricing', component: Pricing, roles: MANAGE },
  { key: 'seating', label: 'Seat map', component: Seating, roles: MANAGE },
  { key: 'orders', label: 'Orders', component: Orders, roles: SELL },
  { key: 'tickets', label: 'Tickets', component: Tickets },
  { key: 'promos', label: 'Promo codes', component: Promos, roles: MANAGE },
  { key: 'reports', label: 'Reports', component: Reports, roles: MANAGE },
];

export default function EventDetail() {
  const { id, tab = 'overview' } = useParams();
  const { can } = useApp();
  const nav = useNavigate();
  const state = useLoad(`/events/${id}`);
  const tabs = TABS.filter((t) => !t.roles || can(...t.roles));
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const Tab = active.component;

  return (
    <Loadable state={state}>
      {(event) => (
        <>
          <div className="crumbs"><Link to="/events">Events</Link> / {event.title}</div>
          <div className="page-head">
            <div>
              <h1>{event.title} <Badge status={event.status} /></h1>
              <div className="muted">{event.artist} · {dateTime(event.starts_at)} · {event.venue || 'Venue TBA'}</div>
            </div>
          </div>
          <Tabs tabs={tabs} value={active.key} onChange={(k) => nav(`/events/${id}/${k}`)} />
          <Tab event={event} reloadEvent={state.reload} />
        </>
      )}
    </Loadable>
  );
}
