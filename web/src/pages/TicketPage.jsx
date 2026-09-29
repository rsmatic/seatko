import { useNavigate, useParams } from 'react-router-dom';
import TicketSheet from '../components/TicketSheet.jsx';

export default function TicketPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const codes = code.split(',').filter(Boolean);
  return (
    <>
      <div className="no-print crumbs"><button className="link" onClick={() => nav(-1)}>← Back</button></div>
      <h1 className="no-print">{codes.length > 1 ? `${codes.length} tickets` : 'Ticket'}</h1>
      <TicketSheet codes={codes} staff />
    </>
  );
}
