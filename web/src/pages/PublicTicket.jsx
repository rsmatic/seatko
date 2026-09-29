import { useParams } from 'react-router-dom';
import TicketSheet from '../components/TicketSheet.jsx';

// Buyer-facing page: /t/:code. No sign-in; the code is the secret.
export default function PublicTicket() {
  const { code } = useParams();
  return (
    <div className="public-ticket">
      <TicketSheet codes={[code]} />
    </div>
  );
}
