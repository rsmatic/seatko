import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import Ticket from './Ticket.jsx';
import { Spinner } from './ui.jsx';

/** Loads one or more tickets by code and shows them with print / download / share actions. */
export default function TicketSheet({ codes, staff }) {
  const { settings, toast } = useApp();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const refs = useRef({});

  useEffect(() => {
    Promise.all(codes.map((c) => api(`/public/tickets/${encodeURIComponent(c)}`)))
      .then(setTickets)
      .catch((e) => setError(e.message));
  }, [codes.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePng = async (t) => {
    try {
      const url = await toPng(refs.current[t.code], { pixelRatio: 2, backgroundColor: '#ffffff' });
      Object.assign(document.createElement('a'), { href: url, download: `ticket-${t.code}.png` }).click();
    } catch {
      toast('Could not render the image; use Print → Save as PDF instead', 'error');
    }
  };

  const copyLink = async (t) => {
    const link = `${window.location.origin}${import.meta.env.BASE_URL}t/${t.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Ticket link copied');
    } catch {
      window.prompt('Copy this link', link);
    }
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!tickets) return <Spinner />;

  return (
    <div className="ticket-sheet">
      <div className="no-print btn-row sheet-actions">
        <button className="btn btn-primary" onClick={() => window.print()}>Print {tickets.length > 1 ? `all ${tickets.length}` : ''}</button>
      </div>
      {tickets.map((t) => (
        <div key={t.code} className="ticket-wrap">
          <Ticket t={t} settings={settings} ref={(el) => { refs.current[t.code] = el; }} />
          <div className="no-print btn-row">
            <button className="btn btn-sm" onClick={() => savePng(t)}>Download PNG</button>
            {staff && <button className="btn btn-sm" onClick={() => copyLink(t)}>Copy link for buyer</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
