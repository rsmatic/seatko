import { useRef, useState } from 'react';
import { api, assetUrl, API_BASE } from '../api.js';
import { useAction, useApp } from '../state.jsx';
import { Field, PageHeader, Spinner, confirmAction } from '../components/ui.jsx';
import Ticket from '../components/Ticket.jsx';

export default function Settings() {
  const { settings } = useApp();
  return settings ? <SettingsForm /> : <Spinner />;
}

function SettingsForm() {
  const { settings, setSettings, org } = useApp();
  const [run, busy] = useAction();
  const fileRef = useRef(null);
  const [f, setF] = useState({
    org_name: settings.org_name, org_tagline: settings.org_tagline, currency: settings.currency,
    qr_color: settings.qr_color, ticket_accent: settings.ticket_accent, ticket_footer: settings.ticket_footer,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSettings(await run(() => api('/settings', { method: 'PUT', body: f }), 'Settings saved'));
  };
  const uploadLogo = async (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    setSettings(await run(() => api('/settings/logo', { method: 'POST', body: fd }), 'Logo replaced. All tickets now use it.'));
  };
  const resetLogo = async () => {
    if (!confirmAction('Go back to the default POIMEN logo?')) return;
    setSettings(await run(() => api('/settings/logo', { method: 'DELETE' }), 'Logo reset'));
  };

  const preview = {
    code: 'PREV-IEW2-QR34', status: 'valid', tier_name: 'VIP', seat_label: 'Center Orchestra · Row A · Seat 8',
    holder_name: 'Juan Dela Cruz', price_cents: 250000, tier_color: f.ticket_accent, order_reference: 'ORD-SAMPLE',
    title: 'POIMEN Live: Shepherds in Song', artist: f.org_name, venue: 'To be announced', starts_at: '2026-12-20T18:00', doors_at: '2026-12-20T17:00',
  };

  return (
    <>
      <PageHeader title="Branding & settings" sub="Logo, colors and text used on every ticket" />
      <div className="grid-2">
        <section className="card">
          <h3>Default ticket &amp; QR logo</h3>
          <p className="muted small">The default logo in the middle of every ticket's QR code and on tickets. An event can use its own logo instead (Edit event → Event logo). Square images work best (PNG, JPG, WEBP or SVG, max 5 MB). Codes use high error correction, so they still scan with the logo on top.</p>
          <div className="logo-row">
            <img className="qr-preview" src={`${API_BASE}/api/public/qr-preview.svg?color=${encodeURIComponent(f.qr_color.slice(1))}&org=${org?.id}&v=${settings.v}`} alt="QR preview" />
            <div>
              <img className="logo-thumb" src={assetUrl(settings.logo_url)} alt="Current logo" />
              <div className="btn-row">
                <button className="btn btn-primary" onClick={() => fileRef.current.click()} disabled={busy}>Replace logo</button>
                {settings.has_custom_logo && <button className="btn" onClick={resetLogo} disabled={busy}>Use default</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
                onChange={(e) => { if (e.target.files[0]) uploadLogo(e.target.files[0]); e.target.value = ''; }} />
            </div>
          </div>
        </section>

        <form className="card" onSubmit={save}>
          <h3>Organization</h3>
          <div className="form-grid">
            <Field label="Name"><input value={f.org_name} onChange={set('org_name')} required /></Field>
            <Field label="Currency" hint="ISO code, e.g. PHP, USD"><input value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} required /></Field>
            <Field label="Tagline" span={2}><input value={f.org_tagline} onChange={set('org_tagline')} /></Field>
            <Field label="QR color" hint="Keep it dark for reliable scanning"><input type="color" value={f.qr_color} onChange={set('qr_color')} /></Field>
            <Field label="Ticket accent"><input type="color" value={f.ticket_accent} onChange={set('ticket_accent')} /></Field>
            <Field label="Ticket footer text" span={2}><input value={f.ticket_footer} onChange={set('ticket_footer')} /></Field>
          </div>
          <button className="btn btn-primary" disabled={busy}>Save settings</button>
        </form>
      </div>
      <section className="card">
        <h3>Ticket preview</h3>
        <Ticket t={preview} settings={{ ...settings, ...f }} />
      </section>
    </>
  );
}
