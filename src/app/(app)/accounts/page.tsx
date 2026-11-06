import Link from 'next/link';
import { currentUser, can } from '@/lib/auth';
import { listAccounts } from '@/lib/services/accounts';
import { listSubsidiaries, listBanks, currencies } from '@/lib/services/reference';
import { money } from '@/lib/format';
import { PageHead, Section, Tag } from '@/components/ui';
import { NewAccountForm } from '@/components/client';

export const metadata = { title: 'Accounts' };

export default async function Accounts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const user = (await currentUser())!;
  const [rows, subs, ccys, banks] = await Promise.all([
    listAccounts(user.corpId, { q: sp.q, currency: sp.currency || undefined, position: sp.position || undefined, status: sp.status || undefined, subsidiaryId: sp.sub ? Number(sp.sub) : undefined }),
    listSubsidiaries(user.corpId), currencies(), listBanks()
  ]);
  const admin = can.manageStructure(user.role);
  return (
    <>
      <PageHead title="Accounts" sub="Bank accounts across subsidiaries, with their reserve position." />
      <form className="filters" method="get">
        <div className="grow"><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q} placeholder="Account, bank, subsidiary, country, currency" /></div>
        <div><label htmlFor="sub">Subsidiary</label><select id="sub" name="sub" defaultValue={sp.sub ?? ''}><option value="">All</option>{subs.map((s: any) => <option key={s.subsidiary_id} value={s.subsidiary_id}>{s.name}</option>)}</select></div>
        <div><label htmlFor="currency">Currency</label><select id="currency" name="currency" defaultValue={sp.currency ?? ''}><option value="">All</option>{ccys.map((c: any) => <option key={c.code}>{c.code}</option>)}</select></div>
        <div><label htmlFor="position">Position</label><select id="position" name="position" defaultValue={sp.position ?? ''}><option value="">All</option><option value="SURPLUS">Surplus</option><option value="DEFICIT">Deficit</option><option value="WITHIN_BAND">Within band</option><option value="TREASURY">Treasury</option><option value="FROZEN">Frozen</option></select></div>
        <div style={{ minWidth: 0 }}><button className="btn">Apply</button></div>
        <div style={{ minWidth: 0 }}><Link className="btn secondary" href="/accounts">Reset</Link></div>
      </form>

      <div className="tbl-wrap"><table>
        <thead><tr><th>Account</th><th>Subsidiary</th><th>Bank</th><th>Type</th><th className="num">Balance</th><th className="num">Minimum reserve</th><th className="num">Surplus / (shortfall)</th><th>Position</th><th className="num">{user.baseCurrency} equiv.</th></tr></thead>
        <tbody>
          {rows.map((a: any) => (
            <tr key={a.account_id}>
              <td><Link href={`/accounts/${a.account_id}`}>{a.nickname}</Link><div className="muted mono">{a.account_number}</div></td>
              <td>{a.subsidiary}</td><td>{a.bank}</td>
              <td>{a.account_type === 'TREASURY' ? 'Treasury' : 'Operating'}</td>
              <td className="num">{money(a.balance, a.currency)}</td>
              <td className="num">{money(a.min_reserve, a.currency)}</td>
              <td className={`num ${Number(a.surplus) < 0 ? 'neg' : ''}`}>{Number(a.surplus) < 0 ? `(${money(Math.abs(a.surplus))})` : money(a.surplus)}</td>
              <td><Tag v={a.cash_position} /></td>
              <td className="num">{money(a.balance_base)}</td>
            </tr>))}
          {rows.length === 0 && <tr><td colSpan={9} className="empty">No accounts match the current filters.</td></tr>}
        </tbody>
      </table></div>
      <p className="note" style={{ marginTop: 8 }}>{rows.length} account{rows.length === 1 ? '' : 's'}</p>

      {admin && (
        <Section title="Add account">
          <details className="disclose"><summary>New bank account</summary><div className="body"><NewAccountForm subsidiaries={subs as any} banks={banks as any} currencies={ccys as any} /></div></details>
        </Section>
      )}
    </>
  );
}
