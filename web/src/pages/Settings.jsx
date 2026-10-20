import { useRef, useState } from 'react';
import { api, assetUrl, API_BASE } from '../api.js';
import { useAction, useApp } from '../state.jsx';
import { Field, PageHeader, Spinner, confirmAction } from '../components/ui.jsx';
import Ticket from '../components/Ticket.jsx';
import sheetScript from '../../../deploy/google-sheet-apps-script.js?raw';

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
    qr_color: settings.qr_color, ticket_accent: settings.ticket_accent, ticket_footer: settings.ticket_footer, buy_instructions: settings.buy_instructions ?? '',
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
            <Field label="How to buy tickets (shown on your website)" span={2}
              hint="Appears when a visitor clicks Get tickets in the website embed. Example: how to pay, where to send the screenshot, when they get their ticket.">
              <textarea rows={4} value={f.buy_instructions} onChange={set('buy_instructions')}
                placeholder={'1. Send your payment via GCash to 09xx xxx xxxx (Juan D.)\n2. Send the screenshot to us on Messenger\n3. We will email your ticket with its QR code'} />
            </Field>
          </div>
          <button className="btn btn-primary" disabled={busy}>Save settings</button>
        </form>
      </div>
      <RequestsSettings />
      <section className="card">
        <h3>Ticket preview</h3>
        <Ticket t={preview} settings={{ ...settings, ...f }} />
      </section>
    </>
  );
}

/** Website ticket requests (with proof of payment) and the optional Google Sheet log. */
function RequestsSettings() {
  const { settings, setSettings, toast } = useApp();
  const [run, busy] = useAction();
  const [enabled, setEnabled] = useState(!!settings.online_requests);
  const [url, setUrl] = useState(settings.sheet_webhook_url ?? '');
  const [methods, setMethods] = useState(new Set(settings.request_methods ?? ['gcash']));
  const toggleMethod = (m) => {
    const next = new Set(methods);
    if (next.has(m)) next.delete(m); else next.add(m);
    setMethods(next);
  };
  const [showSetup, setShowSetup] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSettings(await run(() => api('/settings', { method: 'PUT', body: { online_requests: enabled, sheet_webhook_url: url.trim(), request_methods: [...methods] } }), 'Saved'));
  };
  const copyScript = async () => {
    try { await navigator.clipboard.writeText(sheetScript); toast('Script copied'); } catch { toast('Copy failed: select the script and copy it manually', 'error'); }
  };
  return (
    <form className="card" onSubmit={save}>
      <h3>Online ticket requests</h3>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Let buyers request tickets from your website
          <span className="field-hint"> · In the website's Get tickets window they choose tickets, fill in their details and upload proof of payment. You approve them in each event's Requests tab; seats are only assigned when you approve.</span>
        </span>
      </label>
      <div className="field">
        <span className="field-label">Payment methods buyers can choose</span>
        <div className="seg">
          {[['gcash', 'GCash'], ['maya', 'Maya'], ['bank_transfer', 'Bank transfer'], ['cash', 'Cash'], ['other', 'Other']].map(([k, v]) => (
            <label key={k}><input type="checkbox" checked={methods.has(k)} onChange={() => toggleMethod(k)} /> {v}</label>
          ))}
        </div>
        <span className="field-hint">With only one checked, buyers see it fixed instead of a choice.</span>
      </div>
      <PaymentQr />
      <Field label="Google Sheet (optional)" hint="Every request is also added to this sheet, and updated when you approve or reject it.">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" spellCheck={false} />
      </Field>
      <button type="button" className="link small" onClick={() => setShowSetup(!showSetup)}>{showSetup ? 'Hide' : 'How to connect a Google Sheet'}</button>
      {showSetup && (
        <ol className="setup-steps small">
          <li>Create a new Google Sheet. Open <strong>Extensions → Apps Script</strong>.</li>
          <li>Delete the sample code, paste this script (<button type="button" className="link" onClick={copyScript}>copy script</button>), then click <strong>Save</strong>.</li>
          <li>Click <strong>Deploy → New deployment</strong>, choose type <strong>Web app</strong>, set <em>Execute as: Me</em> and <em>Who has access: Anyone</em>, then <strong>Deploy</strong> and allow access.</li>
          <li>Copy the <strong>Web app URL</strong> (it ends with <span className="mono">/exec</span>), paste it above and click <strong>Save</strong>.</li>
        </ol>
      )}
      <div><button className="btn btn-primary mt" disabled={busy || !methods.size}>Save</button></div>
    </form>
  );
}

/** The QR code buyers scan to pay (e.g. GCash), shown in the website's Get tickets window. */
function PaymentQr() {
  const { settings, setSettings } = useApp();
  const [run, busy] = useAction();
  const fileRef = useRef(null);
  const upload = async (file) => {
    const fd = new FormData();
    fd.append('qr', file);
    setSettings(await run(() => api('/settings/payment-qr', { method: 'POST', body: fd }), 'Payment QR code saved. It now shows on your website.'));
  };
  const remove = async () => {
    if (!confirmAction('Remove the payment QR code from your website?')) return;
    setSettings(await run(() => api('/settings/payment-qr', { method: 'DELETE' }), 'Payment QR code removed'));
  };
  return (
    <div className="field">
      <span className="field-label">Payment QR code (optional)</span>
      <div className="logo-row">
        {settings.payment_qr_url && <img className="payqr-thumb" src={assetUrl(settings.payment_qr_url)} alt="Payment QR code" />}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => fileRef.current.click()} disabled={busy}>{settings.payment_qr_url ? 'Replace QR code' : 'Upload QR code'}</button>
          {settings.payment_qr_url && <button type="button" className="btn" onClick={remove} disabled={busy}>Remove</button>}
        </div>
      </div>
      <span className="field-hint">E.g. your GCash or Maya QR (screenshot from the app). Shown under "How to pay" in your website's Get tickets window so buyers can scan it. PNG, JPG or WEBP, max 5 MB.</span>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(e) => { if (e.target.files[0]) upload(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}
