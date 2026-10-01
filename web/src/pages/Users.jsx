import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useApp, useLoad } from '../state.jsx';
import { dateTime, ROLE_HELP, ROLE_LABEL } from '../format.js';
import { Field, Loadable, Modal, PageHeader, confirmAction } from '../components/ui.jsx';

export default function Users() {
  const { user: me } = useApp();
  const state = useLoad('/users');
  const events = useLoad('/events');
  const eventName = (id) => events.data?.find((e) => e.id === id)?.title ?? `Event #${id}`;
  const [editing, setEditing] = useState(null);
  const [run] = useAction();

  const toggle = async (u) => {
    const updated = await run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), u.active ? 'User deactivated' : 'User reactivated');
    state.setData((rows) => rows.map((r) => (r.id === u.id ? updated : r)));
  };
  const remove = async (u) => {
    if (!confirmAction(`Delete ${u.name}? Their past sales stay on record. Consider deactivating instead.`)) return;
    await run(() => api(`/users/${u.id}`, { method: 'DELETE' }), 'User deleted');
    state.reload();
  };

  return (
    <>
      <PageHeader title="Users" sub="Staff accounts and what they can do">
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ Add user</button>
      </PageHeader>
      <div className="role-cards">
        {Object.entries(ROLE_LABEL).map(([k, v]) => (
          <div key={k} className="role-card"><span className={`badge role-${k}`}>{v}</span><span className="small muted">{ROLE_HELP[k]}</span></div>
        ))}
      </div>
      <Loadable state={state}>
        {(users) => (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Events</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.active ? '' : 'dim'}>
                      <td><strong>{u.name}</strong>{u.id === me.id && <span className="muted small"> (you)</span>}</td>
                      <td>{u.email}</td>
                      <td><span className={`badge role-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
                      <td className="small">
                        {u.all_events ? <span className="muted">All events</span>
                          : u.event_ids.map((id) => <div key={id}>{eventName(id)}</div>)}
                      </td>
                      <td>{u.active ? 'Active' : 'Deactivated'}</td>
                      <td className="small muted">{u.last_login_at ? dateTime(u.last_login_at) : 'Never'}</td>
                      <td className="actions">
                        <button className="btn btn-sm" onClick={() => setEditing(u)}>Edit</button>
                        {u.id !== me.id && <button className="btn btn-sm" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</button>}
                        {u.id !== me.id && <button className="btn btn-sm btn-danger-ghost" onClick={() => remove(u)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Loadable>
      {editing && <UserForm user={editing} events={events.data ?? []} onClose={() => setEditing(null)} onSaved={state.reload} />}
    </>
  );
}

function UserForm({ user, events, onClose, onSaved }) {
  const isNew = !user.id;
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'cashier', password: '' });
  const [allEvents, setAllEvents] = useState(user.all_events ?? true);
  const [eventIds, setEventIds] = useState(new Set(user.event_ids ?? []));
  const toggleEvent = (id) => {
    const next = new Set(eventIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setEventIds(next);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = { ...f, all_events: f.role === 'admin' || allEvents, event_ids: [...eventIds] };
    if (!isNew && !body.password) delete body.password;
    await run(() => api(isNew ? '/users' : `/users/${user.id}`, { method: isNew ? 'POST' : 'PATCH', body }), isNew ? 'User created' : 'User saved');
    onSaved();
    onClose();
  };
  return (
    <Modal title={isNew ? 'Add user' : `Edit ${user.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="user-form" disabled={busy}>Save</button></>}>
      <form id="user-form" className="form-grid" onSubmit={submit}>
        <Field label="Name" span={2}><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Email" span={2}><input type="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Role" span={2} hint={ROLE_HELP[f.role]}>
          <select value={f.role} onChange={set('role')}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {f.role !== 'admin' && (
          <div className="field span-2">
            <span className="field-label">Event access</span>
            <div className="seg">
              <label><input type="radio" checked={allEvents} onChange={() => setAllEvents(true)} /> All events</label>
              <label><input type="radio" checked={!allEvents} onChange={() => setAllEvents(false)} /> Only selected events</label>
            </div>
            {!allEvents && (
              <div className="event-picks">
                {!events.length && <span className="muted small">No events yet.</span>}
                {events.map((e) => (
                  <label key={e.id} className="check">
                    <input type="checkbox" checked={eventIds.has(e.id)} onChange={() => toggleEvent(e.id)} />
                    <span>{e.title}<span className="field-hint"> · {dateTime(e.starts_at)}</span></span>
                  </label>
                ))}
              </div>
            )}
            <span className="field-hint">
              {allEvents ? 'They can work on every event, including new ones.' : 'They only see the events checked here, everywhere in SeatKo (events list, box office, check-in, tickets).'}
            </span>
          </div>
        )}
        <Field label={isNew ? 'Password' : 'Reset password'} span={2} hint={isNew ? 'At least 8 characters' : 'Leave blank to keep the current password'}>
          <input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required={isNew} minLength={8} />
        </Field>
      </form>
    </Modal>
  );
}
