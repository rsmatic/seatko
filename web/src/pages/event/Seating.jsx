import { useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAction, useLoad } from '../../state.jsx';
import { Empty, Field, Loadable, Modal, confirmAction } from '../../components/ui.jsx';
import SeatMap from '../../components/SeatMap.jsx';

export default function Seating({ event, reloadEvent }) {
  const map = useLoad(`/events/${event.id}/seatmap`);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [assignTier, setAssignTier] = useState('');
  const [run, busy] = useAction();
  const seatedTiers = event.tiers.filter((t) => t.kind === 'seated');

  const refresh = () => { map.reload(); reloadEvent(); };

  const bulk = async (action) => {
    const body = { action, seat_ids: [...selected], tier_id: action === 'assign_tier' ? Number(assignTier) || null : undefined };
    const r = await run(() => api(`/events/${event.id}/seats/bulk`, { method: 'POST', body }));
    setSelected(new Set());
    refresh();
    return r;
  };

  // Layout editing: `draft` holds positions while arranging; positionsRef gets the full computed
  // layout (including auto-placed sections) from SeatMap so saving pins everything where it looks.
  const [arrange, setArrange] = useState(false);
  const [draft, setDraft] = useState(null);
  const [active, setActive] = useState(null);
  const positionsRef = useRef(null);

  const startArrange = (sections) => {
    setDraft(new Map(sections.map((s) => [s.id, { x: s.pos_x, y: s.pos_y, angle: s.angle || 0 }])));
    setActive(null);
    setSelected(new Set());
    setArrange(true);
  };

  const rotate = (delta) => {
    const next = new Map([...positionsRef.current].map(([k, v]) => [k, { ...v }]));
    const p = next.get(active);
    p.angle = delta === null ? 0 : (((p.angle || 0) + delta + 540) % 360) - 180;
    setDraft(next);
  };

  const saveLayout = async () => {
    const body = { sections: [...positionsRef.current].map(([id, p]) => ({ id, pos_x: p.x, pos_y: p.y, angle: p.angle || 0 })) };
    await run(() => api(`/events/${event.id}/layout`, { method: 'PUT', body }), 'Layout saved');
    setArrange(false);
    map.reload();
  };

  const removeSection = async (sec) => {
    if (!confirmAction(`Delete section "${sec.name}" and all its seats?`)) return;
    await run(() => api(`/events/${event.id}/sections/${sec.id}`, { method: 'DELETE' }), 'Section deleted');
    refresh();
  };

  return (
    <Loadable state={map}>
      {({ sections, seats }) => (
        <>
          <section className="card">
            <div className="split">
              <div>
                <h3>Sections</h3>
                <p className="muted small">Each section is a grid of rows (A, B, C…) and numbered seats. Pick a default price tier; you can re-price individual seats on the map below.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setEditing({})} disabled={!seatedTiers.length}
                title={!seatedTiers.length ? 'Add a reserved-seat tier in Pricing first' : undefined}>+ Add section</button>
            </div>
            {!seatedTiers.length && <div className="alert">Add at least one <strong>Reserved seat</strong> tier in the Pricing tab before building the seat map.</div>}
            {sections.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Section</th><th>Rows × seats</th><th>Default tier</th><th>Sold</th><th>Blocked</th><th /></tr></thead>
                  <tbody>
                    {sections.map((sec) => {
                      const ss = seats.filter((s) => s.section_id === sec.id);
                      const tier = event.tiers.find((t) => t.id === sec.tier_id);
                      return (
                        <tr key={sec.id}>
                          <td><strong>{sec.name}</strong></td>
                          <td>{sec.rows} × {sec.seats_per_row} = {ss.length}</td>
                          <td>{tier ? <><i className="dot" style={{ background: tier.color }} /> {tier.name}</> : <span className="muted">None</span>}</td>
                          <td>{ss.filter((s) => s.status === 'sold').length}</td>
                          <td>{ss.filter((s) => s.status === 'blocked').length}</td>
                          <td className="actions">
                            <button className="btn btn-sm" onClick={() => setEditing(sec)}>Edit</button>
                            <button className="btn btn-sm btn-danger-ghost" onClick={() => removeSection(sec)}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="split">
              <h3>Seat map</h3>
              {sections.length > 0 && !arrange && (
                <button className="btn btn-sm" onClick={() => startArrange(sections)}>Arrange layout</button>
              )}
            </div>
            {!sections.length ? <Empty title="No sections yet">Add a section to generate seats.</Empty> : arrange ? (
              <>
                <p className="muted small">
                  Drag sections to place them around the stage. Click one to select it, then rotate it or nudge it with the arrow keys (Shift = bigger steps).
                  The box office uses the same layout.
                </p>
                <div className="toolbar">
                  {active ? (
                    <>
                      <strong>{sections.find((s) => s.id === active)?.name}</strong>
                      <button className="btn btn-sm" onClick={() => rotate(-15)} aria-label="Rotate left 15 degrees">⟲ 15°</button>
                      <button className="btn btn-sm" onClick={() => rotate(15)} aria-label="Rotate right 15 degrees">⟳ 15°</button>
                      <span className="small muted">{Math.round(draft?.get(active)?.angle || 0)}°</span>
                      <button className="btn btn-sm btn-ghost" onClick={() => rotate(null)}>Straighten</button>
                    </>
                  ) : <span className="muted small">Select a section to rotate it</span>}
                  <span className="grow" />
                  <button className="btn btn-sm btn-ghost" onClick={() => { setDraft(new Map()); setActive(null); }}>Auto-arrange</button>
                  <button className="btn btn-sm" onClick={() => setArrange(false)}>Cancel</button>
                  <button className="btn btn-sm btn-primary" onClick={saveLayout} disabled={busy}>Save layout</button>
                </div>
                <SeatMap sections={sections} seats={seats} tiers={event.tiers} selected={new Set()} onChange={() => {}} mode="edit"
                  arrange layout={draft} onLayoutChange={setDraft} activeSection={active} onActivate={setActive} positionsRef={positionsRef} />
              </>
            ) : (
              <>
                <p className="muted small">Click or drag across seats to select them, or click a row letter to select the whole row. Sold seats cannot be changed.</p>
                <div className={`toolbar ${selected.size ? '' : 'toolbar-idle'}`}>
                  <strong>{selected.size} selected</strong>
                  <button className="btn btn-sm" disabled={!selected.size || busy} onClick={() => bulk('block')}>Block</button>
                  <button className="btn btn-sm" disabled={!selected.size || busy} onClick={() => bulk('unblock')}>Unblock</button>
                  <select value={assignTier} onChange={(e) => setAssignTier(e.target.value)} aria-label="Tier to assign">
                    <option value="">Assign tier…</option>
                    {seatedTiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="btn btn-sm" disabled={!selected.size || !assignTier || busy} onClick={() => bulk('assign_tier')}>Apply tier</button>
                  <button className="btn btn-sm btn-ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear</button>
                </div>
                <SeatMap sections={sections} seats={seats} tiers={event.tiers} selected={selected} onChange={setSelected} mode="edit" />
              </>
            )}
          </section>
          {editing && <SectionForm event={event} section={editing} tiers={seatedTiers} onClose={() => setEditing(null)} onSaved={refresh} />}
        </>
      )}
    </Loadable>
  );
}

function SectionForm({ event, section, tiers, onClose, onSaved }) {
  const isNew = !section.id;
  const [run, busy] = useAction();
  const [f, setF] = useState({
    name: section.name ?? '',
    rows: section.rows ?? 10,
    seats_per_row: section.seats_per_row ?? 12,
    tier_id: section.tier_id ?? tiers[0]?.id ?? '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const body = { name: f.name, rows: Number(f.rows), seats_per_row: Number(f.seats_per_row) };
    if (isNew || Number(f.tier_id) !== section.tier_id) body.tier_id = Number(f.tier_id) || null;
    await run(
      () => api(isNew ? `/events/${event.id}/sections` : `/events/${event.id}/sections/${section.id}`, { method: isNew ? 'POST' : 'PATCH', body }),
      isNew ? 'Section created' : 'Section updated',
    );
    onSaved();
    onClose();
  };

  return (
    <Modal title={isNew ? 'Add section' : `Edit ${section.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="section-form" disabled={busy}>Save</button></>}>
      <form id="section-form" className="form-grid" onSubmit={submit}>
        <Field label="Section name" span={2}><input value={f.name} onChange={set('name')} required placeholder="Center Orchestra" /></Field>
        <Field label="Rows"><input type="number" min="1" max="100" value={f.rows} onChange={set('rows')} required /></Field>
        <Field label="Seats per row"><input type="number" min="1" max="200" value={f.seats_per_row} onChange={set('seats_per_row')} required /></Field>
        <Field label="Default price tier" span={2}
          hint={isNew ? null : 'Changing this re-prices every unsold seat in the section.'}>
          <select value={f.tier_id} onChange={set('tier_id')}>
            <option value="">No tier (not sellable)</option>
            {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div className="span-2 muted small">{Number(f.rows) * Number(f.seats_per_row) || 0} seats</div>
      </form>
    </Modal>
  );
}
