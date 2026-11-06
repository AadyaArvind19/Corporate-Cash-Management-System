import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, can } from '@/lib/auth';
import { auditEvents } from '@/lib/services/reports';
import { dt } from '@/lib/format';
import { PageHead, Tag, Pager } from '@/components/ui';

export const metadata = { title: 'Audit log' };

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const user = (await currentUser())!;
  if (!can.viewAudit(user.role)) redirect('/overview');
  const a = await auditEvents(user.corpId, { action: sp.action || undefined, outcome: sp.outcome || undefined, username: sp.username || undefined, page: Number(sp.page || 1) });
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== 'page') as [string, string][]).toString();
  return (
    <>
      <PageHead title="Audit log" sub="Security and activity events recorded in MongoDB. Retained for two years." />
      {!a.available ? <div className="alerts">The audit store (MongoDB) is not reachable right now. Treasury operations continue to work and are recorded in PostgreSQL.</div> : (
        <>
          <form className="filters" method="get">
            <div><label htmlFor="action">Action</label><select id="action" name="action" defaultValue={sp.action ?? ''}><option value="">All</option>{a.actions.map((x: string) => <option key={x}>{x}</option>)}</select></div>
            <div><label htmlFor="outcome">Outcome</label><select id="outcome" name="outcome" defaultValue={sp.outcome ?? ''}><option value="">All</option><option>SUCCESS</option><option>FAILURE</option></select></div>
            <div><label htmlFor="username">Username</label><input id="username" name="username" defaultValue={sp.username} /></div>
            <div style={{ minWidth: 0 }}><button className="btn">Apply</button></div>
            <div style={{ minWidth: 0 }}><Link className="btn secondary" href="/admin/audit">Reset</Link></div>
          </form>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Time (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>Outcome</th><th>IP</th><th>Details</th></tr></thead>
            <tbody>{a.rows.map((e: any) => (
              <tr key={String(e._id)}><td>{dt(e.ts)}</td><td>{e.actor?.username ?? <span className="muted">—</span>}</td><td className="mono">{e.action}</td>
                <td>{e.entity ? `${e.entity.type} ${e.entity.id ?? ''}` : ''}</td><td><Tag v={e.outcome} /></td><td className="mono">{e.ip ?? ''}</td>
                <td className="mono muted" style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{e.details ? JSON.stringify(e.details) : ''}</td></tr>))}
              {a.rows.length === 0 && <tr><td colSpan={7} className="empty">No events.</td></tr>}</tbody>
          </table></div>
          <Pager base={`/admin/audit${qs ? `?${qs}` : ''}`} page={a.page} size={a.size} total={a.total} />
        </>
      )}
    </>
  );
}
