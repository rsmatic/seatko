import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAction, useLoad } from '../../state.jsx';
import { Field, Loadable, PageHeader } from '../../components/ui.jsx';
import { PayTo } from '../Billing.jsx';

export default function PlatformSettings() {
  const state = useLoad('/platform/settings');
  return (
    <>
      <PageHeader title="Platform settings" sub="Where organizers send their payments to you" />
      <Loadable state={state}>{(s) => <Form initial={s} />}</Loadable>
    </>
  );
}

function Form({ initial }) {
  const [run, busy] = useAction();
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    run(() => api('/platform/settings', { method: 'PUT', body: f }), 'Saved');
  };
  return (
    <div className="grid-2">
      <form className="card" onSubmit={save}>
        <h3>Payment details</h3>
        <div className="form-grid">
          <Field label="GCash number"><input value={f.gcash_number} onChange={set('gcash_number')} placeholder="09xx xxx xxxx" /></Field>
          <Field label="GCash account name"><input value={f.gcash_name} onChange={set('gcash_name')} /></Field>
          <Field label="Bank details" span={2} hint="Bank, account name and number">
            <textarea rows={3} value={f.bank_details} onChange={set('bank_details')} />
          </Field>
          <Field label="Instructions for organizers" span={2}>
            <textarea rows={3} value={f.payment_instructions} onChange={set('payment_instructions')} />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy}>Save</button>
      </form>
      <section className="card">
        <h3>What organizers see</h3>
        <PayTo payTo={{ instructions: f.payment_instructions, gcash_name: f.gcash_name, gcash_number: f.gcash_number, bank_details: f.bank_details }} />
      </section>
    </div>
  );
}
