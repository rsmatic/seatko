import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp, MANAGE, SCAN } from './state.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import TicketPage from './pages/TicketPage.jsx';
import PublicTicket from './pages/PublicTicket.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Activity from './pages/Activity.jsx';
import Profile from './pages/Profile.jsx';
import Billing from './pages/Billing.jsx';
import { Privacy, Terms } from './pages/Legal.jsx';
import PlatformHome from './pages/platform/PlatformHome.jsx';
import OrgDetail from './pages/platform/OrgDetail.jsx';
import PlatformPayments from './pages/platform/PlatformPayments.jsx';
import PlatformSettings from './pages/platform/PlatformSettings.jsx';

// Lazy: the camera scanner library is large and only scanners need it.
const CheckIn = lazy(() => import('./pages/CheckIn.jsx'));

function Protected({ roles, children }) {
  const { user, booting, can } = useApp();
  const loc = useLocation();
  if (booting) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !can(...roles)) return <Navigate to="/" replace />;
  return children;
}

/** Organizer pages: the SeatKo owner must open an organizer first. */
function OrgOnly() {
  const { org } = useApp();
  return org ? <Outlet /> : <Navigate to="/platform" replace />;
}

function OwnerOnly() {
  const { isOwner } = useApp();
  return isOwner ? <Outlet /> : <Navigate to="/" replace />;
}

function Home() {
  const { user, org } = useApp();
  if (user?.is_superadmin && !org) return <Navigate to="/platform" replace />;
  if (user?.role === 'scanner') return <Navigate to="/checkin" replace />;
  if (user?.role === 'cashier') return <Navigate to="/events" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/t/:code" element={<PublicTicket />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />

        <Route element={<OwnerOnly />}>
          <Route path="platform" element={<PlatformHome />} />
          <Route path="platform/orgs/:id" element={<OrgDetail />} />
          <Route path="platform/payments" element={<PlatformPayments />} />
          <Route path="platform/settings" element={<PlatformSettings />} />
        </Route>

        <Route element={<OrgOnly />}>
          <Route path="events" element={<Events />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="events/:id/:tab" element={<EventDetail />} />
          <Route path="tickets/:code" element={<TicketPage />} />
          <Route path="checkin" element={<Protected roles={SCAN}><Suspense fallback={<Spinner />}><CheckIn /></Suspense></Protected>} />
          <Route path="users" element={<Protected roles={['admin']}><Users /></Protected>} />
          <Route path="settings" element={<Protected roles={['admin']}><Settings /></Protected>} />
          <Route path="billing" element={<Protected roles={['admin']}><Billing /></Protected>} />
          <Route path="activity" element={<Protected roles={['admin']}><Activity /></Protected>} />
          <Route path="dashboard" element={<Protected roles={MANAGE}><Dashboard /></Protected>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
