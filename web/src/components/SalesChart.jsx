import { useMemo, useState } from 'react';
import { money } from '../format.js';

/** Single-series daily revenue bars for the last `days` days. Empty days render as zero. */
export default function SalesChart({ rows, days = 30, unit = 'ticket' }) {
  const [hover, setHover] = useState(null);
  const data = useMemo(() => {
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const out = [];
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const r = byDay.get(key);
      out.push({ day: key, revenue: r?.revenue_cents || 0, count: r?.tickets ?? r?.orders ?? 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [rows, days]);

  const max = Math.max(1, ...data.map((d) => d.revenue));
  const W = 600, H = 160, pad = 4, gap = 2;
  const bw = (W - pad * 2) / data.length - gap;
  const label = (day) => new Date(`${day}T00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Revenue per day, last ${days} days`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={H} y2={H} className="chart-axis" />
        {data.map((d, i) => {
          const h = d.revenue ? Math.max(3, (d.revenue / max) * (H - 10)) : 0;
          const x = pad + i * (bw + gap);
          return (
            <g key={d.day} onMouseEnter={() => setHover({ ...d, x: x + bw / 2 })}>
              <rect x={x - gap / 2} y={0} width={bw + gap} height={H} fill="transparent" />
              {h > 0 && <path d={roundedTop(x, H - h, bw, h, Math.min(4, bw / 2))} className={`chart-bar ${hover?.day === d.day ? 'hot' : ''}`} />}
            </g>
          );
        })}
        <text x={pad} y={H + 14} className="chart-tick">{label(data[0].day)}</text>
        <text x={W - pad} y={H + 14} textAnchor="end" className="chart-tick">Today</text>
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: `${(hover.x / W) * 100}%` }}>
          <strong>{label(hover.day)}</strong>
          <div>{money(hover.revenue)}</div>
          <div className="muted">{hover.count} {unit}{hover.count === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}

function roundedTop(x, y, w, h, r) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
