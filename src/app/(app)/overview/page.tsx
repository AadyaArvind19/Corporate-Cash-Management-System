import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { dashboard } from '@/lib/services/dashboard';
import { money, dt } from '@/lib/format';
import { PageHead, Section, Tag, PositionChart } from '@/components/ui';

export const metadata = { title: 'Overview' };

export default async function Overview() {
  const user = (await currentUser())!;
  const d = await dashboard(user.corpId);
  const L: any = d.liq; const b = user.baseCurrency;
  const total = Number(L.total_cash_base) || 1;
  const deficits = d.positions.filter((p: any) => p.cash_position === 'DEFICIT');
  const frozen = d.positions.filter((p: any) => p.status === 'FROZEN');
  const alerts: string[] = [
    ...deficits.map((p: any) => `${p.nickname} is ${money(Math.abs(Number(p.balance) - Number(p.min_reserve)), p.currency)} below its minimum reserve.`),
    ...frozen.map((p: any) => `${p.nickname} is frozen and excluded from sweeps.`),
    ...d.corridorsDown.map((c: any) => `Corridor ${c.source_bank} → ${c.destination_bank} is suspended.`),
    ...d.stale.map((s: any) => `${s.nickname} has not been reconciled in the last 24 hours.`)
  ];

  return (
    <>
      <PageHead title="Overview" sub={`Consolidated position of ${user.corpName}, expressed in ${b}.`}>
        <Link className="btn" href="/sweeps">Review sweep plan</Link>
      </PageHead>

      <div className="strip">
        <div><div className="k">Total cash</div><div className="v">{money(L.total_cash_base, b, { compact: true })}</div><div className="s">{L.account_count} accounts</div></div>
        <div><div className="k">Central treasury</div><div className="v">{money(L.treasury_cash_base, b, { compact: true })}</div><div className="s">{((Number(L.treasury_cash_base) / total) * 100).toFixed(0)}% of total cash</div></div>
        <div><div className="k">Idle surplus</div><div className="v pos">{money(L.idle_surplus_base, b, { compact: true })}</div><div className="s">Above reserve, ready to sweep</div></div>
        <div><div className="k">Reserve shortfall</div><div className={`v ${Number(L.reserve_shortfall_base) > 0 ? 'neg' : ''}`}>{money(L.reserve_shortfall_base, b, { compact: true })}</div><div className="s">{L.accounts_in_deficit} account{Number(L.accounts_in_deficit) === 1 ? '' : 's'} below reserve</div></div>
      </div>

      {alerts.length > 0 && (
        <Section title="Attention required">
          <div className="alerts"><ul>{alerts.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
        </Section>
      )}

      <div className="grid2" style={{ marginTop: 28 }}>
        <div>
          <div className="sec-head" style={{ marginBottom: 8 }}><h2 style={{ textTransform: 'uppercase', fontSize: 11.5, letterSpacing: '.07em', color: 'var(--ink-2)' }}>Balance against minimum reserve ({b})</h2></div>
          <div className="panel panel-pad">
            <PositionChart currency={b} rows={d.positions.map((p: any) => ({ label: p.nickname, balance: Number(p.balance_base), reserve: Number(p.reserve_base) }))} />
            <p className="note" style={{ marginTop: 6 }}>Bar: current balance. Black marker: minimum reserve. Red bars are below reserve.</p>
          </div>
        </div>
        <div>
          <div className="sec-head" style={{ marginBottom: 8 }}><h2 style={{ textTransform: 'uppercase', fontSize: 11.5, letterSpacing: '.07em', color: 'var(--ink-2)' }}>Exposure by currency</h2></div>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Currency</th><th className="num">{b} equivalent</th><th className="num">Share</th></tr></thead>
            <tbody>{d.byCurrency.map((c: any) => (
              <tr key={c.currency}><td>{c.currency}</td><td className="num">{money(c.balance_base)}</td><td className="num">{((Number(c.balance_base) / total) * 100).toFixed(1)}%</td></tr>))}
            </tbody>
          </table></div>
        </div>
      </div>

      <Section title="Recent sweep batches" right={<Link href="/sweeps/history">All transfers</Link>}>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Batch</th><th>Executed</th><th>By</th><th>Note</th><th className="num">Completed</th><th className="num">Failed</th><th>Status</th></tr></thead>
          <tbody>
            {d.batches.map((x: any) => (
              <tr key={x.batch_id}><td><Link href={`/sweeps/batches/${x.batch_id}`}>#{x.batch_id}</Link></td><td>{dt(x.created_at)}</td><td>{x.initiated_by}</td>
                <td className="muted">{x.note ?? ''}</td><td className="num">{x.completed}</td><td className="num">{x.failed}</td><td><Tag v={x.status} /></td></tr>))}
            {d.batches.length === 0 && <tr><td colSpan={7} className="empty">No batches have been executed yet.</td></tr>}
          </tbody>
        </table></div>
      </Section>
    </>
  );
}
