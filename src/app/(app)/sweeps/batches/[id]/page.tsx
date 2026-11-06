import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { batchDetail } from '@/lib/services/sweeps';
import { money, dt, duration } from '@/lib/format';
import { PageHead, Section, Tag } from '@/components/ui';

export default async function Batch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const user = (await currentUser())!;
  const bid = Number(id); if (!Number.isInteger(bid)) notFound();
  const d: any = await batchDetail(user.corpId, bid); if (!d) notFound();
  const ok = d.transfers.filter((t: any) => t.status === 'COMPLETED').length;
  return (
    <>
      <PageHead title={`Batch #${d.batch.batch_id}`} sub={`Executed ${dt(d.batch.created_at)} by ${d.batch.full_name} (${d.batch.initiated_by})`}><Link className="btn secondary" href="/sweeps/history">Transfer history</Link></PageHead>
      <div className="strip">
        <div><div className="k">Status</div><div className="v" style={{ fontSize: 17 }}><Tag v={d.batch.status} /></div></div>
        <div><div className="k">Transfers</div><div className="v">{d.transfers.length}</div></div>
        <div><div className="k">Completed</div><div className="v pos">{ok}</div></div>
        <div><div className="k">Failed</div><div className={`v ${d.transfers.length - ok ? 'neg' : ''}`}>{d.transfers.length - ok}</div></div>
      </div>
      {d.batch.note && <p className="note" style={{ marginTop: 12 }}>Note: {d.batch.note}</p>}
      <Section title="Transfers">
        <div className="tbl-wrap"><table>
          <thead><tr><th>Type</th><th>From</th><th>To</th><th className="num">Sent</th><th className="num">Fee</th><th className="num">Rate</th><th className="num">Received</th><th>Route</th><th>Status</th></tr></thead>
          <tbody>{d.transfers.map((t: any) => (
            <tr key={t.txn_id}>
              <td>{t.transfer_type === 'SWEEP' ? 'Sweep' : 'Funding'}</td><td>{t.source_account}</td><td>{t.destination_account}</td>
              <td className="num">{money(t.amount_source, t.source_currency)}</td><td className="num">{money(t.fee_amount, t.source_currency)}</td>
              <td className="num">{t.source_currency === t.destination_currency ? '1' : Number(t.fx_rate).toFixed(6)}</td>
              <td className="num">{money(t.amount_destination, t.destination_currency)}</td>
              <td className="route">{t.route_text ?? 'Book transfer'}<div className="muted">{duration(t.latency_minutes)}</div></td>
              <td><Tag v={t.status} />{t.failure_reason && <div className="muted" style={{ maxWidth: 240 }}>{t.failure_reason}</div>}</td>
            </tr>))}
          </tbody>
        </table></div>
      </Section>
    </>
  );
}
