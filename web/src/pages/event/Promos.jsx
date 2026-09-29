import { useState } from 'react';
import { api } from '../../api.js';
import { useAction, useLoad } from '../../state.jsx';
import { dateTime, money, toCents } from '../../format.js';
import { Empty, Field, Loadable, Modal, confirmAction } from '../../components/ui.jsx';

export default function Promos({ event }) {
  const state = useLoad(`/events/${event.id}/promos`);
  const [creating, setCreating] = useState(false);
  const [run] = useAction();

  const toggle = async (p) => {
    const updated = await run(() => api(`/events/${event.id}/promos/${p.id}`, { method: 'PATCH', body: { active: !p.active } }));
    state.setData((rows) => rows.map((r) => (r.id === p.id ? updated : r)));
  };
  const remove = async (p) => {
    if (!confirmAction(`Delete promo code ${p.code}?`)) return;
    await run(() => api(`/events/${event.id}/promos/${p.id}`, { method: 'DELETE' }), 'Promo code deleted');
    state.reload();
  };

  return (
    <section className="card">
      <div className="split">
        <div><h3>Promo codes</h3><p className="muted small">Discounts cashiers can apply at the box office.</p></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New code</button>
      </div>
      <Loadable state={state}>
        {(rows) => !rows.length ? <Empty title="No promo codes" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Expires</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.code}</td>
                    <td>{p.kind === 'percent' ? `${p.value}% off` : `${money(p.value)} off`}</td>
                    <td>{p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''}</td>
                    <td className="small">{p.expires_at ? dateTime(p.expires_at) : 'Never'}</td>
                    <td>{p.active ? <span className="badge badge-on_sale">Active</span> : <span className="badge badge-closed">Off</span>}</td>
                    <td className="actions">
                      <button className="btn btn-sm" onClick={() => toggle(p)}>{p.active ? 'Disable' : 'Enable'}</button>
                      <button className="btn btn-sm btn-danger-ghost" onClick={() => remove(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loadable>
      {creating && <PromoForm event={event} onClose={() => setCreating(false)} onSaved={state.reload} />}
    </section>
  );
}

function PromoForm({ event, onClose, onSaved }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ code: '', kind: 'percent', value: 10, max_uses: '', expires_at: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = {
      code: f.code, kind: f.kind,
      value: f.kind === 'percent' ? Number(f.value) : toCents(f.value),
      max_uses: f.max_uses ? Number(f.max_uses) : null,
      expires_at: f.expires_at || null,
    };
    await run(() => api(`/events/${event.id}/promos`, { method: 'POST', body }), 'Promo code created');
    onSaved();
    onClose();
  };
  return (
    <Modal title="New promo code" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="promo-form" disabled={busy}>Create</button></>}>
      <form id="promo-form" className="form-grid" onSubmit={submit}>
        <Field label="Code" span={2}><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required pattern="[A-Za-z0-9_\-]+" placeholder="EARLYBIRD" /></Field>
        <Field label="Type">
          <select value={f.kind} onChange={set('kind')}><option value="percent">Percent off</option><option value="fixed">Amount off</option></select>
        </Field>
        <Field label={f.kind === 'percent' ? 'Percent' : 'Amount'}>
          <input type="number" min="0" max={f.kind === 'percent' ? 100 : undefined} step={f.kind === 'percent' ? 1 : 0.01} value={f.value} onChange={set('value')} required />
        </Field>
        <Field label="Max uses" hint="Blank = unlimited"><input type="number" min="1" value={f.max_uses} onChange={set('max_uses')} /></Field>
        <Field label="Expires"><input type="datetime-local" value={f.expires_at} onChange={set('expires_at')} /></Field>
      </form>
    </Modal>
  );
}
