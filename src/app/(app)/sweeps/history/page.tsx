import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { sweepHistory } from '@/lib/services/sweeps';
import { listAccounts } from '@/lib/services/accounts';
import { money, dt, duration } from '@/lib/format';
import { PageHead, Tag, Pager } from '@/components/ui';

export const metadata = { title: 'Transfer history' };

export default async function History({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const user = (await currentUser())!;
  const page = Number(sp.page || 1);
  const [h, accounts] = await Promise.all([
    sweepHistory(user.corpId, { status: sp.status || undefined, type: sp.type || undefined, accountId: sp.account ? Number(sp.account) : undefined, from: sp.from || undefined, to: sp.to || undefined, q: sp.q || undefined, page }),
    listAccounts(user.corpId)
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== 'page') as [string, string][]).toString();
  return (
    <>
      <PageHead title="Transfer history" sub="Immutable ledger of every sweep and funding transfer, including failed attempts."><Link className="btn secondary" href="/sweeps">Sweep plan</Link></PageHead>
      <form className="filters" method="get">
        <div className="grow"><label htmlFor="q">Search memo</label><input id="q" name="q" defaultValue={sp.q} placeholder="e.g. payroll cover" /></div>
        <div><label htmlFor="account">Account</label><select id="account" name="account" defaultValue={sp.account ?? ''}><option value="">All</option>{accounts.map((a: any) => <option key={a.account_id} value={a.account_id}>{a.nickname}</option>)}</select></div>
        <div><label htmlFor="type">Type</label><select id="type" name="type" defaultValue={sp.type ?? ''}><option value="">All</option><option value="SWEEP">Sweep</option><option value="FUND">Funding</option></select></div>
        <div><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status ?? ''}><option value="">All</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option></select></div>
        <div><label htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={sp.from} /></div>
        <div><label htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={sp.to} /></div>
        <div style={{ minWidth: 0 }}><button className="btn">Apply</button></div>
        <div style={{ minWidth: 0 }}><Link className="btn secondary" href="/sweeps/history">Reset</Link></div>
      </form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Executed</th><th>Batch</th><th>Type</th><th>From</th><th>To</th><th className="num">Sent</th><th className="num">Fee</th><th className="num">Received</th><th>Hops</th><th>Status</th></tr></thead>
        <tbody>
          {h.rows.map((t: any) => (
            <tr key={t.txn_id}>
              <td>{dt(t.executed_at)}</td><td><Link href={`/sweeps/batches/${t.batch_id}`}>#{t.batch_id}</Link></td>
              <td>{t.transfer_type === 'SWEEP' ? 'Sweep' : 'Funding'}</td>
              <td>{t.source_account}<div className="muted">{t.source_bank}</div></td>
              <td>{t.destination_account}<div className="muted">{t.destination_bank}</div></td>
              <td className="num">{money(t.amount_source, t.source_currency)}</td>
              <td className="num">{money(t.fee_amount, t.source_currency)}</td>
              <td className="num">{money(t.amount_destination, t.destination_currency)}</td>
              <td className="num">{t.hops}</td>
              <td><Tag v={t.status} />{t.failure_reason && <div className="muted" style={{ maxWidth: 220 }}>{t.failure_reason}</div>}</td>
            </tr>))}
          {h.rows.length === 0 && <tr><td colSpan={10} className="empty">No transfers match the current filters.</td></tr>}
        </tbody>
      </table></div>
      <Pager base={`/sweeps/history${qs ? `?${qs}` : ''}`} page={h.page} size={h.pageSize} total={h.total} />
    </>
  );
}
