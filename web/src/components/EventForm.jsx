import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../api.js';
import { useAction, useApp } from '../state.jsx';
import { STATUS_LABEL } from '../format.js';
import { Field, Modal } from './ui.jsx';

export default function EventForm({ event, onClose, onSaved }) {
  const { settings } = useApp();
  const [run, busy] = useAction();
  const [f, setF] = useState({
    title: event?.title ?? '',
    artist: event?.artist ?? settings?.org_name ?? '',
    description: event?.description ?? '',
    venue: event?.venue ?? '',
    address: event?.address ?? '',
    starts_at: event?.starts_at ?? '',
    doors_at: event?.doors_at ?? '',
    status: event?.status ?? 'draft',
    max_per_order: event?.max_per_order ?? 10,
    show_on_website: event ? !!event.show_on_website : true,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Event logo: a newly picked file, or a request to remove the current one.
  const fileRef = useRef(null);
  const [logoFile, setLogoFile] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!logoFile) return setPreview(null);
    const url = URL.createObjectURL(logoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);
  const current = !removeLogo && event?.logo ? assetUrl(`/uploads/${event.logo}`) : null;
  const shown = preview ?? current;

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...f, max_per_order: Number(f.max_per_order) };
    let saved = await run(
      () => (event ? api(`/events/${event.id}`, { method: 'PATCH', body }) : api('/events', { method: 'POST', body })),
      event ? 'Event saved' : 'Event created. Now add ticket prices.',
    );
    if (logoFile) {
      const fd = new FormData();
      fd.append('logo', logoFile);
      saved = await run(() => api(`/events/${saved.id}/logo`, { method: 'POST', body: fd }));
    } else if (removeLogo && event?.logo) {
      saved = await run(() => api(`/events/${saved.id}/logo`, { method: 'DELETE' }));
    }
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="event-form" disabled={busy}>Save</button></>}>
      <form id="event-form" className="form-grid" onSubmit={submit}>
        <Field label="Title" span={2}><input value={f.title} onChange={set('title')} required placeholder="POIMEN Live in Manila" /></Field>
        <Field label="Artist / performer"><input value={f.artist} onChange={set('artist')} /></Field>
        <Field label="Status">
          <select value={f.status} onChange={set('status')}>
            {Object.entries(STATUS_LABEL).slice(0, 5).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Show starts"><input type="datetime-local" value={f.starts_at} onChange={set('starts_at')} required /></Field>
        <Field label="Doors open"><input type="datetime-local" value={f.doors_at ?? ''} onChange={set('doors_at')} /></Field>
        <Field label="Venue"><input value={f.venue} onChange={set('venue')} /></Field>
        <Field label="Max tickets per order" hint="Applies to cashiers; managers can exceed it">
          <input type="number" min="1" max="500" value={f.max_per_order} onChange={set('max_per_order')} />
        </Field>
        <Field label="Address" span={2}><input value={f.address} onChange={set('address')} /></Field>
        <Field label="Description" span={2}><textarea rows={4} value={f.description} onChange={set('description')} /></Field>

        <div className="field span-2">
          <span className="field-label">Event logo (optional)</span>
          <div className="logo-pick">
            <img className={`logo-thumb ${shown ? '' : 'logo-default'}`} src={shown ?? assetUrl(settings?.logo_url)} alt="" />
            <div>
              <div className="btn-row" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-sm" onClick={() => fileRef.current.click()}>{shown ? 'Change logo' : 'Upload logo'}</button>
                {shown && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setLogoFile(null); setRemoveLogo(true); }}>Remove</button>}
              </div>
              <span className="field-hint">
                {shown ? 'Shown in the middle of this event\'s QR codes and on its tickets.'
                  : 'Uses the default logo from Branding & settings. Upload one to use a different logo for this event. Square images work best.'}
              </span>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
              onChange={(e) => { if (e.target.files[0]) { setLogoFile(e.target.files[0]); setRemoveLogo(false); } e.target.value = ''; }} />
          </div>
        </div>

        <label className="check span-2">
          <input type="checkbox" checked={f.show_on_website} onChange={(e) => setF({ ...f, show_on_website: e.target.checked })} />
          <span>
            Show on website
            <span className="field-hint"> The embed on the band site shows prices and availability. Drafts are never shown.</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
