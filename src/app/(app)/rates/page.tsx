import { currentUser, can } from '@/lib/auth';
import { latestRates, rateHistory, currencies } from '@/lib/services/reference';
import { rate as fmtRate, dt } from '@/lib/format';
import { PageHead, Section, Sparkline } from '@/components/ui';
import { RateForm } from '@/components/client';
import Link from 'next/link';

export const metadata = { title: 'Exchange rates' };

export default async function Rates({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const user = (await currentUser())!;
  const [rows, ccys] = await Promise.all([latestRates(), currencies()]);
  const pair = (sp.pair ?? 'USD/EUR').split('/');
  const hist = pair.length === 2 ? await rateHistory(pair[0], pair[1], 90) : [];
  return (
    <>
      <PageHead title="Exchange rates" sub="Latest quote per currency pair. The rate history is append-only; a correction is a new quote." />
      <div className="grid2">
        <div className="tbl-wrap"><table>
          <thead><tr><th>Pair</th><th className="num">Rate</th><th className="num">7-day change</th><th>Effective</th><th>Source</th></tr></thead>
          <tbody>{rows.map((r: any) => {
            const ch = r.rate_7d ? ((Number(r.rate) / Number(r.rate_7d) - 1) * 100) : null;
            const key = `${r.base_currency.trim()}/${r.quote_currency.trim()}`;
            return <tr key={key}><td><Link href={`/rates?pair=${key}`}>{key}</Link></td><td className="num">{fmtRate(r.rate)}</td>
              <td className={`num ${ch === null ? '' : ch < 0 ? 'neg' : 'pos'}`}>{ch === null ? '—' : `${ch > 0 ? '+' : ''}${ch.toFixed(2)}%`}</td><td>{dt(r.effective_at)}</td><td className="muted">{r.source}</td></tr>;
          })}</tbody>
        </table></div>
        <div>
          <div className="sec-head"><h2 style={{ textTransform: 'uppercase', fontSize: 11.5, letterSpacing: '.07em' }}>{pair.join('/')} · 90 days</h2></div>
          <div className="panel panel-pad"><Sparkline points={hist.map((h: any) => Number(h.rate))} />
            <p className="note">{hist.length} quotes. Pairs without a direct quote are derived by inversion or through USD.</p></div>
        </div>
      </div>
      {can.operate(user.role) && <Section title="Record a rate"><div className="panel panel-pad"><RateForm currencies={ccys as any} /></div></Section>}
    </>
  );
}
