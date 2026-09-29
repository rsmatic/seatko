import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useApp, useLoad } from '../state.jsx';
import { dateTime, ROLE_HELP, ROLE_LABEL } from '../format.js';
import { Field, Loadable, Modal, PageHeader, confirmAction } from '../components/ui.jsx';

export default function Users() {
  const { user: me } = useApp();
  const state = useLoad('/users');
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
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.active ? '' : 'dim'}>
                      <td><strong>{u.name}</strong>{u.id === me.id && <span className="muted small"> (you)</span>}</td>
                      <td>{u.email}</td>
                      <td><span className={`badge role-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
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
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} onSaved={state.reload} />}
    </>
  );
}

function UserForm({ user, onClose, onSaved }) {
  const isNew = !user.id;
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? 'cashier', password: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = { ...f };
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
        <Field label={isNew ? 'Password' : 'Reset password'} span={2} hint={isNew ? 'At least 8 characters' : 'Leave blank to keep the current password'}>
          <input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required={isNew} minLength={8} />
        </Field>
      </form>
    </Modal>
  );
}
