import { useState } from 'react';
import { api } from '../../api.js';
import { useAction } from '../../state.jsx';
import { money, toCents, fromCents } from '../../format.js';
import { Empty, Field, Meter, Modal, confirmAction } from '../../components/ui.jsx';

const SWATCHES = ['#d4a24c', '#c0c7d1', '#7c9cbf', '#8fbf7c', '#bf7c9c', '#9c7cbf', '#e07b53', '#8f8f8f'];

export default function Pricing({ event, reloadEvent }) {
  const [editing, setEditing] = useState(null); // tier object or {} for new
  const [run] = useAction();

  const remove = async (t) => {
    if (!confirmAction(`Delete the "${t.name}" tier?`)) return;
    await run(() => api(`/events/${event.id}/tiers/${t.id}`, { method: 'DELETE' }), 'Tier deleted');
    reloadEvent();
  };
  const toggle = async (t) => {
    await run(() => api(`/events/${event.id}/tiers/${t.id}`, { method: 'PATCH', body: { active: !t.active } }), t.active ? 'Tier paused' : 'Tier active');
    reloadEvent();
  };

  return (
    <section className="card">
      <div className="split">
        <div>
          <h3>Ticket prices</h3>
          <p className="muted small">Reserved tiers get their capacity from seats assigned in the Seat map. General admission tiers have a fixed capacity.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ Add tier</button>
      </div>
      {!event.tiers.length ? <Empty title="No ticket tiers">Add VIP, Gold, Silver, General Admission, etc.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tier</th><th>Type</th><th className="num">Price</th><th>Sold</th><th className="num">Gross</th><th>Status</th><th /></tr></thead>
            <tbody>
              {event.tiers.map((t) => (
                <tr key={t.id}>
                  <td><i className="dot" style={{ background: t.color }} /> <strong>{t.name}</strong>{t.description && <div className="muted small">{t.description}</div>}</td>
                  <td>{t.kind === 'ga' ? 'General admission' : 'Reserved seat'}</td>
                  <td className="num">{money(t.price_cents)}</td>
                  <td style={{ minWidth: 140 }}><Meter value={t.sold} max={t.total} color={t.color} /><span className="small muted">{t.sold} / {t.total}</span></td>
                  <td className="num">{money(t.gross_cents)}</td>
                  <td>{t.active ? <span className="badge badge-on_sale">Active</span> : <span className="badge badge-closed">Paused</span>}</td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => setEditing(t)}>Edit</button>
                    <button className="btn btn-sm" onClick={() => toggle(t)}>{t.active ? 'Pause' : 'Resume'}</button>
                    {t.sold === 0 && <button className="btn btn-sm btn-danger-ghost" onClick={() => remove(t)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TierForm event={event} tier={editing} onClose={() => setEditing(null)} onSaved={reloadEvent} />}
    </section>
  );
}

function TierForm({ event, tier, onClose, onSaved }) {
  const [run, busy] = useAction();
  const isNew = !tier.id;
  const [f, setF] = useState({
    name: tier.name ?? '',
    description: tier.description ?? '',
    price: tier.price_cents !== undefined ? fromCents(tier.price_cents) : '',
    color: tier.color ?? SWATCHES[event.tiers.length % SWATCHES.length],
    kind: tier.kind ?? 'seated',
    capacity: tier.capacity ?? '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      name: f.name, description: f.description, color: f.color, kind: f.kind,
      price_cents: toCents(f.price),
      capacity: f.kind === 'ga' ? Number(f.capacity) : undefined,
    };
    await run(
      () => api(isNew ? `/events/${event.id}/tiers` : `/events/${event.id}/tiers/${tier.id}`, { method: isNew ? 'POST' : 'PATCH', body }),
      isNew ? 'Tier added' : 'Tier saved',
    );
    onSaved();
    onClose();
  };

  return (
    <Modal title={isNew ? 'Add ticket tier' : `Edit ${tier.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="tier-form" disabled={busy}>Save</button></>}>
      <form id="tier-form" className="form-grid" onSubmit={submit}>
        <Field label="Name"><input value={f.name} onChange={set('name')} required placeholder="VIP" /></Field>
        <Field label="Price"><input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} required /></Field>
        <Field label="Type" span={2}>
          <div className="seg">
            <label><input type="radio" checked={f.kind === 'seated'} onChange={() => setF({ ...f, kind: 'seated' })} disabled={!isNew && tier.sold > 0} /> Reserved seats</label>
            <label><input type="radio" checked={f.kind === 'ga'} onChange={() => setF({ ...f, kind: 'ga' })} disabled={!isNew && tier.sold > 0} /> General admission</label>
          </div>
        </Field>
        {f.kind === 'ga' && <Field label="Capacity" hint={tier.sold ? `At least ${tier.sold} (already sold)` : null}>
          <input type="number" min={tier.sold || 0} value={f.capacity} onChange={set('capacity')} required />
        </Field>}
        <Field label="Color" span={f.kind === 'ga' ? 1 : 2}>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button type="button" key={c} className={`swatch ${f.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />
            ))}
            <input type="color" value={f.color} onChange={set('color')} aria-label="Custom color" />
          </div>
        </Field>
        <Field label="Description" span={2}><input value={f.description} onChange={set('description')} placeholder="Front rows, meet & greet" /></Field>
      </form>
    </Modal>
  );
}
