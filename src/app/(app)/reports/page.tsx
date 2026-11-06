import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { sqlReports, mongoReports } from '@/lib/services/reports';
import { money, num, dt } from '@/lib/format';
import { PageHead, Section, Tag } from '@/components/ui';

export const metadata = { title: 'Reports' };

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const user = (await currentUser())!;
  const days = [30, 90, 180, 365].includes(Number(sp.days)) ? Number(sp.days) : 90;
  const b = user.baseCurrency;
  const [s, m] = await Promise.all([sqlReports(user.corpId, days), mongoReports(user.corpId, days)]);
  return (
    <>
      <PageHead title="Reports" sub={`Cost and flow of liquidity movements. Amounts in ${b} at the rate on the day of each transfer.`}>
        <form method="get" className="inline-form"><div><label htmlFor="days">Period</label>
          <select id="days" name="days" defaultValue={days} style={{ width: 150 }}>{[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></div>
          <button className="btn secondary">Apply</button></form>
      </PageHead>

      <Section title="Transfer cost by corridor"><div className="tbl-wrap"><table>
        <thead><tr><th>Corridor</th><th className="num">Transfers</th><th className="num">Fees ({b})</th><th className="num">Latency</th></tr></thead>
        <tbody>{s.corridorFees.map((r: any) => <tr key={r.corridor_id}><td>{r.from_bank} → {r.to_bank}</td><td className="num">{r.transfers}</td><td className="num">{money(r.fees_base)}</td><td className="num">{r.avg_latency} min</td></tr>)}
          {s.corridorFees.length === 0 && <tr><td colSpan={4} className="empty">No corridor used at least twice in this period.</td></tr>}</tbody>
      </table></div></Section>

      <div className="grid2">
        <Section title="Swept volume by week"><div className="tbl-wrap"><table>
          <thead><tr><th>Week of</th><th className="num">Swept ({b})</th><th className="num">Fees</th><th className="num">Cumulative</th></tr></thead>
          <tbody>{s.weekly.map((r: any) => <tr key={r.week}><td>{dt(r.week, false)}</td><td className="num">{money(r.swept)}</td><td className="num">{money(r.fees)}</td><td className="num">{money(r.cumulative)}</td></tr>)}</tbody>
        </table></div></Section>
        <Section title="Fee cost by subsidiary"><div className="tbl-wrap"><table>
          <thead><tr><th>Subsidiary</th><th className="num">Sweeps</th><th className="num">Fees ({b})</th><th className="num">% of volume</th></tr></thead>
          <tbody>{s.subsidiaryCost.map((r: any) => <tr key={r.subsidiary}><td>{r.subsidiary}</td><td className="num">{r.transfers}</td><td className="num">{money(r.fees_base)}</td><td className="num">{r.fee_pct}%</td></tr>)}</tbody>
        </table></div></Section>
      </div>

      <div className="grid2">
        <Section title="Currency exposure"><div className="tbl-wrap"><table>
          <thead><tr><th>Currency</th><th className="num">Accounts</th><th className="num">Native balance</th><th className="num">{b} equiv.</th><th className="num">Share</th></tr></thead>
          <tbody>{s.exposure.map((r: any) => <tr key={r.currency}><td>{r.currency}</td><td className="num">{r.accounts}</td><td className="num">{money(r.balance, r.currency)}</td><td className="num">{money(r.balance_base)}</td><td className="num">{r.share_pct}%</td></tr>)}</tbody>
        </table></div></Section>
        <Section title="Operating accounts above their currency average"><div className="tbl-wrap"><table>
          <thead><tr><th>Account</th><th className="num">Balance</th><th className="num">Currency average</th></tr></thead>
          <tbody>{s.aboveAvg.map((r: any) => <tr key={r.account_id}><td>{r.nickname}</td><td className="num">{money(r.balance, r.currency)}</td><td className="num">{money(r.currency_avg, r.currency)}</td></tr>)}
            {s.aboveAvg.length === 0 && <tr><td colSpan={3} className="empty">None.</td></tr>}</tbody>
        </table></div></Section>
      </div>

      <h2 style={{ marginTop: 40, fontSize: 16 }}>Activity analytics <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· MongoDB aggregation</span></h2>
      {!m.available ? (
        <div className="alerts" style={{ marginTop: 12 }}>The MongoDB analytics store is not reachable, so audit and run-snapshot analytics are unavailable. Core treasury operations are unaffected.</div>
      ) : (
        <>
          <div className="grid2">
            <Section title="Corridor usage across executed batches"><div className="tbl-wrap"><table>
              <thead><tr><th>Corridor</th><th className="num">Transfers</th><th className="num">Volume ({b})</th><th className="num">Avg latency</th></tr></thead>
              <tbody>{m.corridors.map((r: any) => <tr key={r.corridorId}><td>{r.fromBank} → {r.toBank}</td><td className="num">{r.transfers}</td><td className="num">{money(r.volumeBase)}</td><td className="num">{r.avgLatencyMin} min</td></tr>)}
                {m.corridors.length === 0 && <tr><td colSpan={4} className="empty">No executed batches have been snapshotted yet.</td></tr>}</tbody>
            </table></div></Section>
            <Section title="Batch efficiency"><div className="tbl-wrap"><table>
              <thead><tr><th>Batch</th><th className="num">Volume</th><th className="num">Fees</th><th className="num">Fee rate</th></tr></thead>
              <tbody>{m.batches.map((r: any) => <tr key={r.batchId}><td><Link href={`/sweeps/batches/${r.batchId}`}>#{r.batchId}</Link></td><td className="num">{money(r.volumeBase)}</td><td className="num">{money(r.feesBase)}</td><td className="num">{Number(r.feeRatePct).toFixed(3)}%</td></tr>)}
                {m.batches.length === 0 && <tr><td colSpan={4} className="empty">No data.</td></tr>}</tbody>
            </table></div></Section>
          </div>
          <div className="grid2">
            <Section title="System activity"><div className="tbl-wrap"><table>
              <thead><tr><th>Action</th><th>Outcome</th><th className="num">Events</th><th>Last seen</th></tr></thead>
              <tbody>{m.activity.map((r: any, i: number) => <tr key={i}><td className="mono">{r.action}</td><td><Tag v={r.outcome} /></td><td className="num">{r.events}</td><td>{dt(r.lastSeen)}</td></tr>)}
                {m.activity.length === 0 && <tr><td colSpan={4} className="empty">No activity recorded.</td></tr>}</tbody>
            </table></div></Section>
            <Section title="Failed sign-ins"><div className="tbl-wrap"><table>
              <thead><tr><th>Username</th><th className="num">Attempts</th><th>Last attempt</th></tr></thead>
              <tbody>{m.failed.map((r: any) => <tr key={r.username}><td className="mono">{r.username}</td><td className="num">{r.attempts}</td><td>{dt(r.lastAttempt)}</td></tr>)}
                {m.failed.length === 0 && <tr><td colSpan={3} className="empty">No failed sign-ins in this period.</td></tr>}</tbody>
            </table></div></Section>
          </div>
        </>
      )}
    </>
  );
}
