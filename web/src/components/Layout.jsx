import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { assetUrl } from '../api.js';
import { ROLE_LABEL } from '../format.js';
import { useApp, SCAN } from '../state.jsx';
import { useEffect } from 'react';

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  events: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-1V1h-2zm3 18H5V8h14v11z',
  checkin: 'M3 11h8V3H3v8zm2-6h4v4H5V5zm-2 16h8v-8H3v8zm2-6h4v4H5v-4zm8-12v8h8V3h-8zm6 6h-4V5h4v4zm0 10h2v2h-2zm-6-6h2v2h-2zm2 2h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zm0-4h2v2h-2zm2 2h2v2h-2z',
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  settings: 'M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.03 7.03 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.87a.48.48 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z',
  activity: 'M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 112.05 4.95l-1.42 1.42A9 9 0 1013 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
};

const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d={ICONS[name]} /></svg>
);

export default function Layout() {
  const { user, logout, can, settings } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const nav = [
    can('admin', 'manager') && { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/events', label: 'Events', icon: 'events' },
    can(...SCAN) && { to: '/checkin', label: 'Check-in', icon: 'checkin' },
    can('admin') && { to: '/users', label: 'Users', icon: 'users' },
    can('admin') && { to: '/settings', label: 'Branding & settings', icon: 'settings' },
    can('admin') && { to: '/activity', label: 'Activity log', icon: 'activity' },
  ].filter(Boolean);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
        <span className="brand-name">{settings?.org_name}</span>
      </header>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          {settings?.logo_url && <img src={assetUrl(settings.logo_url)} alt="" className="brand-logo" />}
          <div>
            <div className="brand-name">{settings?.org_name || 'Seatko'}</div>
            <div className="brand-sub">Ticketing</div>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name={n.icon} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/profile" className="me">
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="me-name">{user.name}</div>
              <div className="me-role">{ROLE_LABEL[user.role]}</div>
            </div>
          </NavLink>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
