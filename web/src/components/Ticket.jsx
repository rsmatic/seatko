import { forwardRef } from 'react';
import { assetUrl, qrUrl } from '../api.js';
import { dateLong, money, timeOnly } from '../format.js';

/** Printable ticket. `t` is the shape returned by GET /api/public/tickets/:code. */
const Ticket = forwardRef(function Ticket({ t, settings }, ref) {
  const [section, row, seat] = t.seat_label ? t.seat_label.split(' · ') : [];
  const accent = settings?.ticket_accent || '#d4a24c';
  return (
    <div className={`ticket ticket-${t.status}`} ref={ref} style={{ '--accent': accent, '--tier': t.tier_color || accent }}>
      <div className="ticket-main">
        <div className="ticket-brand">
          {(t.logo_url || settings?.logo_url) && <img src={assetUrl(t.logo_url || settings.logo_url)} alt="" />}
          <span>{settings?.org_name}</span>
          <span className="ticket-tier">{t.tier_name}</span>
        </div>
        <div className="ticket-artist">{t.artist}</div>
        <div className="ticket-title">{t.title}</div>
        <div className="ticket-when">
          <div><label>Date</label>{dateLong(t.starts_at)}</div>
          <div><label>Show</label>{timeOnly(t.starts_at)}</div>
          {t.doors_at && <div><label>Doors</label>{timeOnly(t.doors_at)}</div>}
        </div>
        <div className="ticket-venue"><label>Venue</label>{t.venue || 'To be announced'}{t.address && <span> · {t.address}</span>}</div>
        {t.seat_label ? (
          <div className="ticket-seat">
            <div><label>Section</label>{section}</div>
            <div><label>Row</label>{row?.replace('Row ', '')}</div>
            <div><label>Seat</label>{seat?.replace('Seat ', '')}</div>
          </div>
        ) : (
          <div className="ticket-seat"><div><label>Admission</label>{t.tier_name}</div></div>
        )}
        <div className="ticket-holder">
          <div><label>Holder</label>{t.holder_name}</div>
          <div><label>Price</label>{money(t.price_cents)}</div>
          <div><label>Order</label>{t.order_reference}</div>
        </div>
      </div>
      <div className="ticket-stub">
        <img className="ticket-qr" src={qrUrl(t.code, settings?.v)} alt={`QR code ${t.code}`} crossOrigin="anonymous" />
        <div className="ticket-code">{t.code}</div>
        {t.status !== 'valid' && <div className="ticket-stamp">{t.status === 'used' ? 'Checked in' : 'VOID'}</div>}
        <div className="ticket-foot">{settings?.ticket_footer}</div>
      </div>
    </div>
  );
});

export default Ticket;
