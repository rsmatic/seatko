import { useState } from 'react';
import { api } from '../api.js';
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
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...f, max_per_order: Number(f.max_per_order) };
    const saved = await run(
      () => (event ? api(`/events/${event.id}`, { method: 'PATCH', body }) : api('/events', { method: 'POST', body })),
      event ? 'Event saved' : 'Event created. Now add ticket prices.',
    );
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
      </form>
    </Modal>
  );
}
