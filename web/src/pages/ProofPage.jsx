import { Link, useParams } from 'react-router-dom';
import { useLoad } from '../state.jsx';
import { dateTime, money } from '../format.js';
import { Loadable, PageHeader } from '../components/ui.jsx';
import { ProofImage } from '../components/BillingBits.jsx';

// Direct link to a request's payment screenshot (used by the Google Sheet "Proof" column).
export default function ProofPage() {
  const { id } = useParams();
  const state = useLoad(`/requests/${id}`);
  return (
    <Loadable state={state}>
      {(r) => (
        <>
          <PageHeader title={`Proof of payment · ${r.reference}`}
            sub={`${r.buyer_name} · ${money(r.amount_cents)} via ${r.payment_method === 'gcash' ? 'GCash' : r.payment_method}${r.payment_ref ? ` · ref. ${r.payment_ref}` : ''} · ${dateTime(r.created_at)}`}>
            <Link className="btn btn-primary" to={`/events/${r.event_id}/requests?request=${r.id}`}>Open request</Link>
          </PageHeader>
          <section className="card proof-page">
            <ProofImage path={`/requests/${r.id}/proof`} />
          </section>
        </>
      )}
    </Loadable>
  );
}
