import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { setCurrency } from './format.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [settings, setSettingsState] = useState(null);
  const [toasts, setToasts] = useState([]);

  const setSettings = useCallback((s) => {
    setCurrency(s.currency);
    setSettingsState({ ...s, v: Date.now() }); // v busts cached QR/logo images after a change
  }, []);

  useEffect(() => {
    api('/settings').then(setSettings).catch(() => setSettings({ org_name: 'SeatKo', currency: 'PHP' }));
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setBooting(false));
  }, [setSettings]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('seatko:logout', onLogout);
    return () => window.removeEventListener('seatko:logout', onLogout);
  }, []);

  const login = async (email, password) => {
    const { token, user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(token);
    setUser(u);
    return u;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const toast = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const can = (...roles) => !!user && roles.includes(user.role);

  return (
    <AppContext.Provider value={{ user, booting, login, logout, can, settings, setSettings, toast }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

export const MANAGE = ['admin', 'manager'];
export const SELL = ['admin', 'manager', 'cashier'];
export const SCAN = ['admin', 'manager', 'scanner'];

/** Load data from the API; returns { data, error, loading, reload, setData }. */
export function useLoad(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    if (!path) return Promise.resolve();
    setState((s) => ({ ...s, loading: true }));
    return api(path)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState((s) => ({ ...s, error, loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    reload();
  }, [reload]);
  const setData = (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn }));
  return { ...state, reload, setData };
}

/** Wrap an async action with busy state and toast on error. */
export function useAction() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async (fn, success) => {
    setBusy(true);
    try {
      const out = await fn();
      if (success) toast(success);
      return out;
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return [run, busy];
}
