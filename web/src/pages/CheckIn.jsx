import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api.js';
import { useLoad } from '../state.jsx';
import { dateTime, timeOnly } from '../format.js';
import { PageHeader, Spinner } from '../components/ui.jsx';

const RESULT_STYLE = {
  ok: { cls: 'scan-ok', title: 'Valid · admit' },
  already_used: { cls: 'scan-warn', title: 'Already checked in' },
  void: { cls: 'scan-bad', title: 'Void ticket' },
  wrong_event: { cls: 'scan-bad', title: 'Wrong event' },
  not_found: { cls: 'scan-bad', title: 'Not found' },
};

function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
    if (!ok) navigator.vibrate?.(300);
  } catch { /* audio unavailable */ }
}

export default function CheckIn() {
  const events = useLoad('/events');
  const [eventId, setEventId] = useState('');
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState('');
  const recent = useLoad(eventId ? `/events/${eventId}/checkins` : null);
  const stats = useLoad(eventId ? `/events/${eventId}` : null);
  const lastScan = useRef({ code: '', at: 0 });
  const scanner = useRef(null);

  useEffect(() => {
    if (!eventId && events.data?.length) {
      const live = events.data.filter((e) => ['on_sale', 'sold_out', 'closed'].includes(e.status));
      const soonest = [...live].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      if (soonest) setEventId(String(soonest.id));
    }
  }, [events.data, eventId]);

  const check = useCallback(async (code) => {
    const now = Date.now();
    if (code === lastScan.current.code && now - lastScan.current.at < 3000) return; // same QR still in frame
    lastScan.current = { code, at: now };
    try {
      const r = await api('/checkin', { method: 'POST', body: { code, event_id: Number(eventId) } });
      setResult(r);
      beep(r.result === 'ok');
      if (r.result === 'ok') { recent.reload(); stats.reload(); }
    } catch (e) {
      setResult({ result: 'not_found', message: e.message });
      beep(false);
    }
  }, [eventId, recent, stats]);

  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    if (!camera) return;
    setCamError('');
    const s = new Html5Qrcode('qr-reader', { verbose: false });
    scanner.current = s;
    s.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => checkRef.current(text), () => {})
      .catch((e) => { setCamError(String(e?.message || e)); setCamera(false); });
    return () => {
      if (s.isScanning) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [camera]);

  const submitManual = (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    lastScan.current = { code: '', at: 0 };
    check(manual.trim());
    setManual('');
  };

  if (!events.data) return <Spinner />;
  const style = result && RESULT_STYLE[result.result];
  const s = stats.data?.summary;

  return (
    <>
      <PageHeader title="Check-in" sub="Scan ticket QR codes at the entrance">
        <select value={eventId} onChange={(e) => { setEventId(e.target.value); setResult(null); }} aria-label="Event">
          <option value="">Choose event…</option>
          {events.data.filter((e) => e.status !== 'cancelled').map((e) => <option key={e.id} value={e.id}>{e.title} · {dateTime(e.starts_at)}</option>)}
        </select>
      </PageHeader>

      {!eventId ? <div className="alert">Choose the event you're checking people into.</div> : (
        <div className="grid-2">
          <section className="card">
            {s && <div className="checkin-count"><strong>{s.checked_in}</strong> / {s.sold} checked in</div>}
            <div id="qr-reader" className={camera ? 'qr-reader on' : 'qr-reader'} />
            {camError && <div className="alert alert-error">Camera unavailable: {camError}. Camera access needs HTTPS or localhost.</div>}
            <button className={`btn btn-block ${camera ? '' : 'btn-primary'}`} onClick={() => setCamera(!camera)}>{camera ? 'Stop camera' : 'Start camera scanner'}</button>
            <form className="promo mt" onSubmit={submitManual}>
              <input placeholder="Or type / scan code: XXXX-XXXX-XXXX" value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} autoFocus />
              <button className="btn">Check</button>
            </form>
            <p className="muted small">USB/Bluetooth barcode scanners work too: focus the box above and scan.</p>
          </section>

          <section className="card">
            {result ? (
              <div className={`scan-result ${style.cls}`} role="alert">
                <div className="scan-title">{style.title}</div>
                <div>{result.message}</div>
                {result.ticket && (
                  <div className="scan-ticket">
                    <div className="mono">{result.ticket.code}</div>
                    <div><strong>{result.ticket.holder_name}</strong></div>
                    <div>{result.ticket.seat_label ?? result.ticket.tier_name}</div>
                  </div>
                )}
              </div>
            ) : <div className="scan-result scan-idle"><div className="scan-title">Ready</div><div>Scan a ticket to begin</div></div>}

            <h3 className="mt">Recent check-ins</h3>
            <ul className="list compact">
              {(recent.data || []).map((t) => (
                <li key={t.id} className="split small">
                  <span><span className="mono">{t.code}</span> · {t.holder_name} · {t.seat_label ?? t.tier_name}</span>
                  <span className="muted">{timeOnly(t.checked_in_at)}</span>
                </li>
              ))}
              {recent.data && !recent.data.length && <li className="muted small">No one checked in yet.</li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
