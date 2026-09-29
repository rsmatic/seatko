import { useEffect, useMemo, useRef } from 'react';
import { money } from '../format.js';

/**
 * Interactive seat map.
 * mode="sell": only available seats with an active tier can be picked.
 * mode="edit": any unsold seat can be picked (for block/unblock/assign tier).
 * Click-and-drag paints a selection across seats; clicking a row label toggles the whole row.
 */
export default function SeatMap({ sections, seats, tiers, selected, onChange, mode = 'sell' }) {
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);
  const paint = useRef(null); // { add: boolean } while dragging

  useEffect(() => {
    const stop = () => { paint.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const selectable = (s) => {
    if (s.status === 'sold') return false;
    if (mode === 'edit') return true;
    const t = tierById.get(s.tier_id);
    return s.status === 'available' && t && t.active;
  };

  const setMany = (ids, add) => {
    const next = new Set(selected);
    ids.forEach((id) => (add ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  const bySection = useMemo(() => {
    const m = new Map();
    for (const s of seats) {
      if (!m.has(s.section_id)) m.set(s.section_id, new Map());
      const rows = m.get(s.section_id);
      if (!rows.has(s.row_index)) rows.set(s.row_index, []);
      rows.get(s.row_index).push(s);
    }
    return m;
  }, [seats]);

  const seatTitle = (s) => {
    const t = tierById.get(s.tier_id);
    const parts = [`Row ${s.row_label} · Seat ${s.number}`, t ? `${t.name} · ${money(t.price_cents)}` : 'No price tier'];
    if (s.status === 'sold') parts.push(`Sold${s.holder_name ? ` to ${s.holder_name}` : ''}${s.ticket_code ? ` (${s.ticket_code})` : ''}`);
    if (s.status === 'blocked') parts.push('Blocked');
    return parts.join('\n');
  };

  return (
    <div className="seatmap" onPointerLeave={() => { paint.current = null; }}>
      <div className="stage">STAGE</div>
      <div className="sections">
        {sections.map((sec) => {
          const rows = [...(bySection.get(sec.id)?.entries() ?? [])].sort((a, b) => a[0] - b[0]);
          return (
            <div key={sec.id} className="section">
              <div className="section-name">{sec.name}</div>
              {rows.map(([ri, rowSeats]) => {
                const pickable = rowSeats.filter(selectable).map((s) => s.id);
                const allOn = pickable.length > 0 && pickable.every((id) => selected.has(id));
                return (
                  <div key={ri} className="seat-row">
                    <button type="button" className="row-label" onClick={() => setMany(pickable, !allOn)} title={`Select row ${rowSeats[0].row_label}`}>
                      {rowSeats[0].row_label}
                    </button>
                    {rowSeats.map((s) => {
                      const t = tierById.get(s.tier_id);
                      const can = selectable(s);
                      const on = selected.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`seat seat-${s.status} ${on ? 'selected' : ''} ${!t ? 'no-tier' : ''}`}
                          style={{ '--tier': t?.color ?? '#555' }}
                          disabled={!can}
                          title={seatTitle(s)}
                          aria-label={seatTitle(s)}
                          aria-pressed={on}
                          onPointerDown={(e) => {
                            if (!can) return;
                            e.preventDefault();
                            paint.current = { add: !on };
                            setMany([s.id], !on);
                          }}
                          onPointerEnter={() => {
                            if (paint.current && can && on !== paint.current.add) setMany([s.id], paint.current.add);
                          }}
                          onKeyDown={(e) => {
                            if (can && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setMany([s.id], !on); }
                          }}
                        >
                          {s.number}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="legend">
        {tiers.filter((t) => t.kind === 'seated').map((t) => (
          <span key={t.id} className="legend-item"><i className="seat-swatch" style={{ background: t.color }} />{t.name} · {money(t.price_cents)}</span>
        ))}
        <span className="legend-item"><i className="seat-swatch swatch-sold" />Sold</span>
        <span className="legend-item"><i className="seat-swatch swatch-blocked" />Blocked</span>
        <span className="legend-item"><i className="seat-swatch swatch-selected" />Selected</span>
      </div>
    </div>
  );
}
