const nf = new Map<string, Intl.NumberFormat>();

export function money(value: string | number | null | undefined, currency?: string, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  const zero = currency === 'JPY';
  const key = `${currency ?? ''}|${opts.compact ? 'c' : 'f'}|${zero}`;
  let f = nf.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', opts.compact
      ? { notation: 'compact', maximumFractionDigits: 2 }
      : { minimumFractionDigits: zero ? 0 : 2, maximumFractionDigits: zero ? 0 : 2 });
    nf.set(key, f);
  }
  return `${f.format(n)}${currency ? ' ' + currency : ''}`;
}

export function num(value: string | number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function rate(value: string | number): string {
  const n = Number(value);
  return n >= 100 ? n.toFixed(3) : n >= 1 ? n.toFixed(4) : n.toFixed(6);
}

export function dt(value: Date | string | null | undefined, withTime = true): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
}

export function duration(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return '—';
  if (mins === 0) return 'Same day book transfer';
  if (mins < 60) return `${mins} min`;
  const h = mins / 60;
  return h < 24 ? `${h % 1 ? h.toFixed(1) : h} h` : `${(h / 24).toFixed(1)} d`;
}

export function pct(value: string | number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(digits)}%`;
}
