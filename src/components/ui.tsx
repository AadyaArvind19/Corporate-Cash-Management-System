import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="inline-form">{children}</div>}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return <section className="section"><div className="sec-head"><h2>{title}</h2>{right}</div>{children}</section>;
}

const TONE: Record<string, string> = {
  SURPLUS: 'pos', DEFICIT: 'neg', TREASURY: 'acc', WITHIN_BAND: '', FROZEN: 'warn', CLOSED: '',
  ACTIVE: 'pos', SUSPENDED: 'neg', COMPLETED: 'pos', FAILED: 'neg', PARTIAL: 'warn',
  SWEEP: 'acc', FUND: 'warn', NONE: '', NO_ROUTE: 'neg', INSUFFICIENT_TREASURY: 'neg',
  SUCCESS: 'pos', FAILURE: 'neg', ADMIN: 'acc', TREASURER: '', ANALYST: ''
};
const LABEL: Record<string, string> = { WITHIN_BAND: 'Within band', NO_ROUTE: 'No route', INSUFFICIENT_TREASURY: 'Treasury short', NONE: 'No action' };

export function Tag({ v }: { v: string }) {
  const text = LABEL[v] ?? v.charAt(0) + v.slice(1).toLowerCase();
  return <span className={`tag ${TONE[v] ?? ''}`}>{text}</span>;
}

export function Pager({ base, page, size, total }: { base: string; page: number; size: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => `${base}${base.includes('?') ? '&' : '?'}page=${p}`;
  return (
    <div className="pager">
      <span>{total === 0 ? 'No records' : `${(page - 1) * size + 1}–${Math.min(total, page * size)} of ${total}`}</span>
      <span className="links">
        {page > 1 && <Link className="btn secondary sm" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn secondary sm" href={href(page + 1)}>Next</Link>}
      </span>
    </div>
  );
}

/** Horizontal bars: balance vs. reserve marker per account, in base currency. */
export function PositionChart({ rows, currency }: { rows: { label: string; balance: number; reserve: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.balance, r.reserve)));
  const rowH = 26, left = 190, w = 560, h = rows.length * rowH + 24;
  const x = (v: number) => left + (v / max) * (w - left - 16);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const fmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`Account balance versus minimum reserve in ${currency}`}>
      {ticks.map((t) => (
        <g key={t}><line className="grid" x1={x(t)} x2={x(t)} y1={0} y2={h - 18} /><text x={x(t)} y={h - 4} textAnchor="middle">{fmt(t)}</text></g>
      ))}
      {rows.map((r, i) => {
        const y = i * rowH + 4; const below = r.balance < r.reserve;
        return (
          <g key={r.label}>
            <text x={left - 10} y={y + 13} textAnchor="end">{r.label.length > 26 ? r.label.slice(0, 25) + '…' : r.label}</text>
            <rect x={left} y={y + 2} width={Math.max(1, x(r.balance) - left)} height={14} fill={below ? '#c98f89' : '#6d8f9c'} />
            <line x1={x(r.reserve)} x2={x(r.reserve)} y1={y - 1} y2={y + 19} stroke="#1c2127" strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ points, width = 520, height = 120 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), pad = 14;
  const span = max - min || 1;
  const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (width - pad * 2), pad + (1 - (p - min) / span) * (height - pad * 2)]);
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Rate history">
      <line className="grid" x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} />
      <polyline fill="none" stroke="#1d4a5c" strokeWidth={1.6} points={xy.map((p) => p.join(',')).join(' ')} />
      <text x={pad} y={10}>{max.toFixed(max >= 100 ? 2 : 4)}</text>
      <text x={pad} y={height - 2}>{min.toFixed(min >= 100 ? 2 : 4)}</text>
    </svg>
  );
}
