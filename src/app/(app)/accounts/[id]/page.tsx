import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser, can } from '@/lib/auth';
import { getAccount, accountHistory, accountTransfers } from '@/lib/services/accounts';
import { money, dt } from '@/lib/format';
import { PageHead, Section, Tag, Sparkline } from '@/components/ui';
import { BalanceForm, AccountSettings } from '@/components/client';

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const user = (await currentUser())!;
  const aid = Number(id); if (!Number.isInteger(aid)) notFound();
  const a: any = await getAccount(user.corpId, aid); if (!a) notFound();
  const [hist, transfers] = await Promise.all([accountHistory(aid), accountTransfers(aid)]);
  const series = [...hist].reverse().map((h: any) => Number(h.new_balance));
  return (
    <>
      <PageHead title={a.nickname} sub={`${a.subsidiary} · ${a.bank} · ${a.account_number}`}><Link className="btn secondary" href="/accounts">All accounts</Link></PageHead>
      <div className="strip">
        <div><div className="k">Balance</div><div className="v">{money(a.balance, a.currency)}</div><div className="s">{money(a.balance_base, a.base_currency)} equivalent</div></div>
        <div><div className="k">Minimum reserve</div><div className="v">{money(a.min_reserve, a.currency)}</div><div className="s">Sweep threshold {money(a.min_sweep_amount, a.currency)}</div></div>
        <div><div className="k">Surplus / (shortfall)</div><div className={`v ${Number(a.surplus) < 0 ? 'neg' : ''}`}>{money(a.surplus, a.currency)}</div><div className="s"><Tag v={a.cash_position} /></div></div>
        <div><div className="k">Last reconciled</div><div className="v" style={{ fontSize: 16 }}>{dt(a.last_reconciled_at)}</div><div className="s">{a.account_type === 'TREASURY' ? 'Treasury account' : 'Operating account'} · {a.status.toLowerCase()}</div></div>
      </div>

      {can.operate(user.role) && a.status === 'ACTIVE' && <Section title="Post bank statement balance"><div className="panel panel-pad"><BalanceForm accountId={aid} current={a.balance} currency={a.currency} /></div></Section>}
      {can.manageStructure(user.role) && <Section title="Account settings"><div className="panel panel-pad"><AccountSettings a={a} /></div></Section>}

      <div className="grid2">
        <Section title="Balance history">
          {series.length > 1 && <div className="panel panel-pad" style={{ marginBottom: 10 }}><Sparkline points={series} /></div>}
          <div className="tbl-wrap"><table>
            <thead><tr><th>When</th><th className="num">Change</th><th className="num">New balance</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>{hist.map((h: any) => (
              <tr key={h.history_id}><td>{dt(h.changed_at)}</td>
                <td className={`num ${Number(h.delta) < 0 ? 'neg' : 'pos'}`}>{Number(h.delta) > 0 ? '+' : ''}{money(h.delta)}</td>
                <td className="num">{money(h.new_balance)}</td><td className="muted">{h.reason ?? ''}</td><td>{h.changed_by ?? ''}</td></tr>))}
            </tbody>
          </table></div>
        </Section>
        <Section title="Recent transfers">
          <div className="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>{transfers.map((t: any) => {
              const out = t.source_account_id === aid;
              return <tr key={t.txn_id}><td><Link href={`/sweeps/batches/${t.batch_id}`}>{dt(t.executed_at, false)}</Link></td><td>{t.transfer_type === 'SWEEP' ? 'Sweep' : 'Funding'} {out ? 'out' : 'in'}</td>
                <td className="num">{out ? money(t.amount_source, t.source_currency) : money(t.amount_destination, t.destination_currency)}</td><td><Tag v={t.status} /></td></tr>;
            })}
              {transfers.length === 0 && <tr><td colSpan={4} className="empty">No transfers yet.</td></tr>}
            </tbody>
          </table></div>
        </Section>
      </div>
    </>
  );
}
