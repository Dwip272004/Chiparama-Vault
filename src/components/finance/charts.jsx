import React, { useState } from 'react';
import { fmtINR, fmtCompact } from '../../finance.js';

// Single-series vertical bars (one hue, no legend; title names the series)
export function MonthBars({ data, height = 220 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const ticks = [0, nice / 2, nice];
  return (
    <div className="mbars" style={{ height }}>
      <div className="mbars-axis">{ticks.slice().reverse().map((t) => <span key={t}>{fmtCompact(t)}</span>)}</div>
      <div className="mbars-plot">
        {ticks.map((t) => <div key={t} className="gridline" style={{ bottom: `calc(24px + (100% - 24px) * ${t / nice})` }} />)}
        {data.map((d, i) => (
          <div key={d.key} className={'mbar-col' + (d.current ? ' current' : '')} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="mbar-track">
              <div className="mbar" style={{ height: d.value ? `max(3px, ${(d.value / nice) * 100}%)` : 0 }} />
            </div>
            <span className="mbar-label">{d.label}</span>
            {hover === i && (
              <div className="viz-tip" style={{ bottom: `calc(${Math.min(100, (d.value / nice) * 100)}% + 30px)` }}>
                <b>{d.full}</b>
                <div>{fmtINR(d.value)}</div>
                {d.count != null && <div className="muted">{d.count} paid invoice{d.count === 1 ? '' : 's'}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Ranked horizontal bars with value + share labels
export function RankBars({ data, total, empty = 'No data' }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <div className="muted small pad">{empty}</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="rbars">
      {data.map((d, i) => (
        <div key={d.label} className={'rbar-row' + (hover === i ? ' hover' : '')} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          title={`${d.label}: ${fmtINR(d.value)}${total ? ` (${((d.value / total) * 100).toFixed(1)}%)` : ''}`}>
          <span className="rbar-label">{d.label}</span>
          <div className="rbar-track"><div className={'rbar' + (d.other ? ' other' : '')} style={{ width: `${(d.value / max) * 100}%` }} /></div>
          <span className="rbar-val">{fmtCompact(d.value)}{total ? <em>{((d.value / total) * 100).toFixed(0)}%</em> : null}</span>
        </div>
      ))}
    </div>
  );
}

export function topN(map, n = 7) {
  const arr = Object.entries(map).map(([label, value]) => ({ label, value })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (arr.length <= n + 1) return arr;
  const rest = arr.slice(n).reduce((s, d) => s + d.value, 0);
  return [...arr.slice(0, n), { label: `Other (${arr.length - n})`, value: rest, other: true }];
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function StatusPill({ tone, children }) {
  const icon = { good: '●', warning: '▲', critical: '■', info: '◆', neutral: '○' }[tone] || '○';
  return <span className={'spill ' + tone}><i>{icon}</i>{children}</span>;
}
