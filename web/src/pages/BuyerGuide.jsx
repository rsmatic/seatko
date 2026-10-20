import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { assetUrl, API_BASE } from '../api.js';
import { useApp, useLoad } from '../state.jsx';
import { dateTime, money } from '../format.js';
import { Field, Loadable } from '../components/ui.jsx';

// Print sizes (portrait, mm) and the resolution of the downloaded PNG.
const SIZES = {
  a4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297, dpi: 200 },
  a3: { label: 'A3 (297 × 420 mm)', w: 297, h: 420, dpi: 200 },
  tarp23: { label: 'Tarpaulin 2 × 3 ft', w: 610, h: 914, dpi: 120 },
  tarp34: { label: 'Tarpaulin 3 × 4 ft', w: 914, h: 1219, dpi: 100 },
};
const PX_PER_MM = 96 / 25.4;

const TEXT = {
  en: {
    heading: 'How to get your ticket',
    online: 'Buy online',
    onlineSteps: [
      'Scan the QR code below to open our website.',
      'Tap Get tickets, choose your tickets and fill in your details.',
      'Pay via GCash and upload the screenshot of your payment.',
      'We confirm your payment and email your ticket with its QR code.',
    ],
    scanSite: 'Scan to buy online',
    onsite: 'Buy here at the event',
    onsiteSteps: [
      'Scan the QR code below and fill in the form.',
      'Choose your tickets and submit to get your reference number.',
      'Show your reference at the ticket booth and pay in cash or GCash.',
      'Your ticket with its QR code is emailed to you once paid.',
    ],
    scanOnsite: 'Scan to fill in the form',
    scanPay: 'GCash QR',
    footer: 'Show your ticket QR code at the entrance · One scan per ticket',
  },
  fil: {
    heading: 'Paano bumili ng ticket',
    online: 'Bumili online',
    onlineSteps: [
      'I-scan ang QR code sa ibaba para buksan ang aming website.',
      'I-tap ang Get tickets, piliin ang ticket at ilagay ang iyong detalye.',
      'Magbayad sa GCash at i-upload ang screenshot ng bayad.',
      'Kukumpirmahin namin ang bayad at ie-email ang iyong ticket na may QR code.',
    ],
    scanSite: 'I-scan para bumili online',
    onsite: 'Bumili dito sa event',
    onsiteSteps: [
      'I-scan ang QR code sa ibaba at sagutan ang form.',
      'Piliin ang ticket at i-submit para makuha ang reference number.',
      'Ipakita ang reference sa ticket booth at magbayad ng cash o GCash.',
      'Ie-email sa iyo ang ticket na may QR code kapag bayad na.',
    ],
    scanOnsite: 'I-scan para sa form',
    scanPay: 'GCash QR',
    footer: 'Ipakita ang QR code ng ticket sa entrance · Isang scan bawat ticket',
  },
};

/** Printable banner that shows buyers how to get a ticket, online or at the event. */
export default function BuyerGuide() {
  const { id } = useParams();
  const state = useLoad(`/events/${id}`);
  return <Loadable state={state}>{(event) => <Guide event={event} />}</Loadable>;
}

function Guide({ event }) {
  const { settings, toast } = useApp();
  const [size, setSize] = useState('a4');
  const [lang, setLang] = useState('en');
  const [siteInput, setSite] = useState(null); // null: use the website saved in settings (which may load after this page)
  // SeatKo's hosted ticket form: the on-site QR opens it (buyers pay at the booth), and it stands in
  // for the website when none is set.
  const buyPage = `${API_BASE || window.location.origin}/buy/${event.id}`;
  const site = siteInput ?? (settings?.website_url || buyPage);
  const [showOnline, setShowOnline] = useState(true);
  const [showOnsite, setShowOnsite] = useState(true);
  const [busy, setBusy] = useState(false);
  const banner = useRef(null);
  const frame = useRef(null);
  const [scale, setScale] = useState(0.5);
  const s = SIZES[size];
  const t = TEXT[lang];

  const siteQr = useMemo(() => qrSvg(site.trim()), [site]);
  const onsiteQr = useMemo(() => qrSvg(`${buyPage}?onsite=1`), [buyPage]);

  // Scale the full-size banner down to fit the preview area.
  useLayoutEffect(() => {
    const fit = () => frame.current && setScale(Math.min(1, frame.current.clientWidth / (s.w * PX_PER_MM)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [s.w]);

  // Shrink the text until everything fits on the page (more tiers or longer text need less room each).
  const fit = useCallback(() => {
    const node = banner.current;
    if (!node) return;
    let mm = s.w / 32;
    node.style.fontSize = `${mm}mm`;
    for (let i = 0; i < 30 && node.scrollHeight > node.clientHeight + 1; i++) {
      mm *= 0.96;
      node.style.fontSize = `${mm}mm`;
    }
  }, [s.w]);
  useLayoutEffect(fit, [fit, lang, site, showOnline, showOnsite]);

  // The printed page is exactly the banner size.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@media print { @page { size: ${s.w}mm ${s.h}mm; margin: 0; } }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [s.w, s.h]);

  const download = async () => {
    setBusy(true);
    try {
      const node = banner.current;
      const url = await toPng(node, { pixelRatio: (s.w / 25.4) * s.dpi / node.offsetWidth, backgroundColor: '#ffffff' });
      Object.assign(document.createElement('a'), { href: url, download: `buyer-guide-${size}.png` }).click();
    } catch {
      toast('Could not render the image; use Print → Save as PDF instead', 'error');
    } finally {
      setBusy(false);
    }
  };

  const tiers = event.tiers.filter((x) => x.active);
  const accent = settings?.ticket_accent || '#d4a24c';
  const both = showOnline && showOnsite;
  // Editable text: click it in the preview to change it before printing.
  const edit = { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false };
  // The GCash QR goes with "at the event", or with "online" when that is the only option shown.
  const payQr = settings?.payment_qr_url && (
    <figure>
      <img className="guide-qr" src={assetUrl(settings.payment_qr_url)} alt="" crossOrigin="anonymous" onLoad={fit} />
      <figcaption {...edit}>{t.scanPay}</figcaption>
    </figure>
  );

  return (
    <>
      <div className="no-print">
        <div className="crumbs"><Link to={`/events/${event.id}`}>{event.title}</Link> / Buyer's guide banner</div>
        <h1>Buyer's guide banner</h1>
        <p className="muted">Print it and put it up at the venue or ticket booth. Click any text on the banner to change it before printing.</p>
        <section className="card guide-controls">
          <div className="form-grid">
            <Field label="Size">
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Language">
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="en">English</option>
                <option value="fil">Filipino</option>
              </select>
            </Field>
            <Field label="Website for buying online" span={2} hint="The page with your Get tickets button. Its QR code goes on the banner. Set a default in Branding & settings; without one, SeatKo's own ticket page is used. The on-site QR always opens SeatKo's form for buyers who pay at the booth.">
              <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://poimen.ph" spellCheck={false} />
            </Field>
          </div>
          <div className="seg">
            <label><input type="checkbox" checked={showOnline} onChange={(e) => setShowOnline(e.target.checked)} disabled={!showOnsite} /> Buy online</label>
            <label><input type="checkbox" checked={showOnsite} onChange={(e) => setShowOnsite(e.target.checked)} disabled={!showOnline} /> Buy at the event</label>
          </div>
          {!settings?.payment_qr_url && <p className="field-hint">Tip: upload your GCash QR in Branding &amp; settings → Online ticket requests to show it on the banner.</p>}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
            <button className="btn" onClick={download} disabled={busy}>{busy ? 'Rendering…' : 'Download PNG'}</button>
          </div>
          <p className="field-hint">For a tarpaulin, send the PDF (Print → Save as PDF) or the PNG to the print shop.</p>
        </section>
      </div>

      <div className="guide-frame" ref={frame}>
        <div className="guide-scaler" style={{ width: s.w * PX_PER_MM * scale, height: s.h * PX_PER_MM * scale }}>
          <div className="guide" key={lang} ref={banner} onInput={fit}
            style={{ width: `${s.w}mm`, height: `${s.h}mm`, '--g-accent': accent, transform: `scale(${scale})` }}>
            <header className="guide-head">
              {settings?.logo_url && <img src={assetUrl(settings.logo_url)} alt="" crossOrigin="anonymous" onLoad={fit} />}
              <div {...edit} className="guide-org">{settings?.org_name}</div>
              <div {...edit} className="guide-title">{event.title}</div>
              <div {...edit} className="guide-when">{dateTime(event.starts_at)}{event.venue ? ` · ${event.venue}` : ''}</div>
            </header>

            <div {...edit} className="guide-heading">{t.heading}</div>

            {tiers.length > 0 && (
              <div className="guide-prices">
                {tiers.map((x) => (
                  <div key={x.id} className="guide-price" style={{ borderColor: x.color }}>
                    <span {...edit}>{x.name}</span><strong>{money(x.price_cents)}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className={`guide-cols ${both ? '' : 'guide-one'}`}>
              {showOnline && (
                <section className="guide-col">
                  <h2 {...edit}>{both ? '1 · ' : ''}{t.online}</h2>
                  <ol>{t.onlineSteps.map((x) => <li key={x} {...edit}>{x}</li>)}</ol>
                  <div className="guide-qrs">
                    {siteQr && (
                      <figure>
                        <div className="guide-qr" dangerouslySetInnerHTML={{ __html: siteQr }} />
                        <figcaption {...edit}>{t.scanSite}</figcaption>
                      </figure>
                    )}
                    {!showOnsite && payQr}
                  </div>
                </section>
              )}
              {showOnsite && (
                <section className="guide-col">
                  <h2 {...edit}>{both ? '2 · ' : ''}{t.onsite}</h2>
                  <ol>{t.onsiteSteps.map((x) => <li key={x} {...edit}>{x}</li>)}</ol>
                  <div className="guide-qrs">
                    <figure>
                      <div className="guide-qr" dangerouslySetInnerHTML={{ __html: onsiteQr }} />
                      <figcaption {...edit}>{t.scanOnsite}</figcaption>
                    </figure>
                    {payQr}
                  </div>
                </section>
              )}
            </div>

            <footer {...edit} className="guide-foot">{t.footer}</footer>
          </div>
        </div>
      </div>
    </>
  );
}

function qrSvg(text) {
  let svg = '';
  if (text) QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (_e, out) => { svg = out ?? ''; });
  return svg;
}
