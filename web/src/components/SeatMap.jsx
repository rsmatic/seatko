import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { money } from '../format.js';

const GAP = 40;       // space between auto-arranged sections
const SNAP = 5;       // drag snapping, px
const PAD = 24;       // canvas padding
const STAGE_H = 34;
const STAGE_GAP = 28; // space between stage and the first row of sections
const MIN_SCALE = 0.6; // below this, scroll instead of shrinking (keeps seats tappable)

const hasPos = (p) => p && p.x !== null && p.x !== undefined;

/**
 * Interactive seat map.
 * mode="sell": only available seats with an active tier can be picked.
 * mode="edit": any unsold seat can be picked (for block/unblock/assign tier).
 * Click-and-drag paints a selection across seats; clicking a row label toggles the whole row.
 *
 * Layout: each section is placed by its center (x, y) in px, relative to the stage's center line
 * (y = 0 is just below the stage) and may be rotated. Sections without a saved position are laid
 * out automatically in a row. With `arrange`, sections can be dragged and nudged with arrow keys;
 * every change reports the full layout via onLayoutChange(Map<id, {x, y, angle}>).
 */
export default function SeatMap({
  sections, seats, tiers, selected, onChange, mode = 'sell',
  arrange = false, layout, onLayoutChange, activeSection, onActivate, positionsRef,
}) {
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);
  const paint = useRef(null); // { add: boolean } while painting a selection
  const drag = useRef(null);  // { id, sx, sy, x, y } while moving a section
  const secEls = useRef(new Map());
  const [sizes, setSizes] = useState(() => new Map());
  const wrapEl = useRef(null);
  const [avail, setAvail] = useState(0);

  // Track the available width so wide layouts shrink to fit.
  useLayoutEffect(() => {
    const el = wrapEl.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const stop = () => { paint.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  // Measure each section's natural (unrotated) size; transforms don't affect offsetWidth/Height.
  useLayoutEffect(() => {
    let changed = false;
    const next = new Map(sizes);
    for (const sec of sections) {
      const el = secEls.current.get(sec.id);
      if (!el) continue;
      const s = { w: el.offsetWidth, h: el.offsetHeight };
      const old = sizes.get(sec.id);
      if (!old || old.w !== s.w || old.h !== s.h) { next.set(sec.id, s); changed = true; }
    }
    if (changed) setSizes(next);
  });

  // Saved positions, from the draft layout while arranging, otherwise from the sections themselves.
  const saved = useMemo(() => {
    if (layout) return layout;
    return new Map(sections.map((s) => [s.id, { x: s.pos_x, y: s.pos_y, angle: s.angle || 0 }]));
  }, [layout, sections]);

  const positions = useMemo(() => {
    const out = new Map();
    const size = (id) => sizes.get(id) ?? { w: 0, h: 0 };
    let bottom = 0;
    for (const sec of sections) {
      const p = saved.get(sec.id);
      if (hasPos(p)) {
        out.set(sec.id, { x: p.x, y: p.y, angle: p.angle || 0 });
        bottom = Math.max(bottom, p.y + size(sec.id).h / 2);
      }
    }
    // Unplaced sections: one centered row, below any placed ones.
    const auto = sections.filter((s) => !out.has(s.id));
    const total = auto.reduce((a, s) => a + size(s.id).w, 0) + GAP * Math.max(0, auto.length - 1);
    const top = out.size ? bottom + GAP : 0;
    let x = -total / 2;
    for (const sec of auto) {
      const { w, h } = size(sec.id);
      out.set(sec.id, { x: x + w / 2, y: top + h / 2, angle: saved.get(sec.id)?.angle || 0 });
      x += w + GAP;
    }
    return out;
  }, [sections, saved, sizes]);
  if (positionsRef) positionsRef.current = positions;

  // Canvas bounds: every section's rotated bounding box, plus the stage.
  const frame = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const sec of sections) {
      const { w, h } = sizes.get(sec.id) ?? { w: 0, h: 0 };
      const p = positions.get(sec.id);
      const a = ((p.angle || 0) * Math.PI) / 180;
      const hw = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
      const hh = (Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) / 2;
      minX = Math.min(minX, p.x - hw); maxX = Math.max(maxX, p.x + hw);
      minY = Math.min(minY, p.y - hh); maxY = Math.max(maxY, p.y + hh);
    }
    if (!sections.length) { minX = maxX = minY = maxY = 0; }
    const span = Math.max(Math.abs(minX), Math.abs(maxX)) * 2;
    const stageW = Math.round(Math.min(520, Math.max(240, span * 0.55)));
    const stageTop = -(STAGE_H + STAGE_GAP);
    minX = Math.min(minX, -stageW / 2); maxX = Math.max(maxX, stageW / 2);
    minY = Math.min(minY, stageTop);
    return { ox: PAD - minX, oy: PAD - minY, width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2, stageW, stageTop };
  }, [sections, sizes, positions]);

  const scale = avail ? Math.min(1, Math.max(MIN_SCALE, avail / frame.width)) : 1;

  const emit = (id, patch) => {
    const next = new Map([...positions].map(([k, v]) => [k, { ...v }]));
    next.set(id, { ...next.get(id), ...patch });
    onLayoutChange?.(next);
  };

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

  const snap = (v) => Math.round(v / SNAP) * SNAP;

  const sectionHandlers = (sec) => !arrange ? {} : {
    tabIndex: 0,
    role: 'button',
    'aria-label': `${sec.name}: drag to move, arrow keys to nudge`,
    onPointerDown: (e) => {
      const p = positions.get(sec.id);
      drag.current = { id: sec.id, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      onActivate?.(sec.id);
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d || d.id !== sec.id) return;
      const x = snap(d.x + (e.clientX - d.sx) / scale);
      const y = snap(d.y + (e.clientY - d.sy) / scale);
      const p = positions.get(sec.id);
      if (x !== p.x || y !== p.y) emit(sec.id, { x, y });
    },
    onPointerUp: () => { drag.current = null; },
    onKeyDown: (e) => {
      const step = e.shiftKey ? 25 : SNAP;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!delta) return;
      e.preventDefault();
      const p = positions.get(sec.id);
      emit(sec.id, { x: p.x + delta[0], y: p.y + delta[1] });
    },
    onFocus: () => onActivate?.(sec.id),
  };

  return (
    <div className="seatmap" ref={wrapEl} onPointerLeave={() => { paint.current = null; }}>
      <div className="seat-fit" style={{ width: frame.width * scale, height: frame.height * scale }}>
        <div className={`seat-canvas ${arrange ? 'arranging' : ''}`}
          style={{ width: frame.width, height: frame.height, transform: scale < 1 ? `scale(${scale})` : undefined }}>
          <div className="stage" style={{ left: frame.ox - frame.stageW / 2, top: frame.oy + frame.stageTop, width: frame.stageW, height: STAGE_H }}>STAGE</div>
          {sections.map((sec) => {
            const rows = [...(bySection.get(sec.id)?.entries() ?? [])].sort((a, b) => a[0] - b[0]);
            const { w, h } = sizes.get(sec.id) ?? { w: 0, h: 0 };
            const p = positions.get(sec.id);
            return (
              <div
                key={sec.id}
                ref={(el) => (el ? secEls.current.set(sec.id, el) : secEls.current.delete(sec.id))}
                className={`section ${arrange && activeSection === sec.id ? 'active' : ''}`}
                style={{
                  left: frame.ox + p.x - w / 2,
                  top: frame.oy + p.y - h / 2,
                  transform: p.angle ? `rotate(${p.angle}deg)` : undefined,
                  visibility: sizes.has(sec.id) ? 'visible' : 'hidden',
                }}
                {...sectionHandlers(sec)}
              >
                <div className="section-name">{sec.name}</div>
                {rows.map(([ri, rowSeats]) => {
                  const pickable = rowSeats.filter(selectable).map((s) => s.id);
                  const allOn = pickable.length > 0 && pickable.every((id) => selected.has(id));
                  return (
                    <div key={ri} className="seat-row">
                      <button type="button" className="row-label" tabIndex={arrange ? -1 : 0} onClick={() => setMany(pickable, !allOn)} title={`Select row ${rowSeats[0].row_label}`}>
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
                            tabIndex={arrange ? -1 : 0}
                            title={seatTitle(s)}
                            aria-label={seatTitle(s)}
                            aria-pressed={on}
                            onPointerDown={(e) => {
                              if (arrange || !can) return;
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
