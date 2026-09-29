import { useState } from 'react';
import { api } from '../api.js';
import { useAction, useApp } from '../state.jsx';
import { ROLE_HELP, ROLE_LABEL } from '../format.js';
import { Field, PageHeader } from '../components/ui.jsx';

export default function Profile() {
  const { user } = useApp();
  const [run, busy] = useAction();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setError('New passwords do not match');
    setError('');
    await run(() => api('/auth/password', { method: 'POST', body: f }), 'Password changed');
    setF({ currentPassword: '', newPassword: '', confirm: '' });
  };

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid-2">
        <section className="card">
          <dl className="details">
            <dt>Name</dt><dd>{user.name}</dd>
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Role</dt><dd><span className={`badge role-${user.role}`}>{ROLE_LABEL[user.role]}</span><div className="muted small">{ROLE_HELP[user.role]}</div></dd>
          </dl>
        </section>
        <form className="card" onSubmit={submit}>
          <h3>Change password</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <Field label="Current password"><input type="password" autoComplete="current-password" value={f.currentPassword} onChange={set('currentPassword')} required /></Field>
          <Field label="New password" hint="At least 8 characters"><input type="password" autoComplete="new-password" minLength={8} value={f.newPassword} onChange={set('newPassword')} required /></Field>
          <Field label="Confirm new password"><input type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} required /></Field>
          <button className="btn btn-primary" disabled={busy}>Update password</button>
        </form>
      </div>
    </>
  );
}
