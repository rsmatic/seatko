// Base URL of the API. Empty = same origin (Vite dev proxy or API serving the built app).
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'seatko_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

/** Turn an API-relative path (/uploads/x.png, /api/...) into a full URL. */
export const assetUrl = (path) => (path && !/^https?:/.test(path) ? `${API_BASE}${path}` : path);
export const qrUrl = (code, v = '') => `${API_BASE}/api/public/qr/${code}.svg${v ? `?v=${v}` : ''}`;

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload });
  } catch {
    throw new Error(API_BASE
      ? `Can't reach the Seatko server at ${API_BASE}. Check that it is running.`
      : "Can't reach the Seatko server. No API URL is configured for this site yet.");
  }
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('seatko:logout'));
  }
  if (raw && res.ok) return res;
  if (!res.ok && !(res.headers.get('content-type') || '').includes('json')) {
    // A static host (e.g. GitHub Pages) answered instead of the API.
    throw new Error("Can't reach the Seatko server. No API URL is configured for this site yet.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function download(path, filename) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The Seatko app's own logo (served from web/public). */
export const SEATKO_LOGO = `${import.meta.env.BASE_URL}seatko.svg`;
