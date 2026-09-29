import { useLoad } from '../state.jsx';
import { dateTime } from '../format.js';
import { Loadable, PageHeader } from '../components/ui.jsx';

export default function Activity() {
  const state = useLoad('/audit?limit=500');
  return (
    <>
      <PageHeader title="Activity log" sub="Who did what: sales, refunds, voids, check-ins, changes" />
      <Loadable state={state}>
        {(rows) => (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>User</th><th>Action</th><th>Item</th><th>Details</th></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="small muted nowrap">{dateTime(a.created_at)}</td>
                      <td>{a.user_name ?? '—'}</td>
                      <td><span className="badge">{a.action.replace(/_/g, ' ')}</span></td>
                      <td className="small">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                      <td className="small muted details-cell">{a.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Loadable>
    </>
  );
}
