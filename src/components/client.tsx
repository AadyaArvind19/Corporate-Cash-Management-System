'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { money as fmtMoney, num, duration, rate as fmtRate } from '@/lib/format';

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function useSubmit(onDone?: (data: any) => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function run(url: string, method: string, body?: unknown, success = 'Saved') {
    setBusy(true); setError(null); setOk(null);
    const r = await call(url, method, body);
    setBusy(false);
    if (!r.ok) { setError(r.data?.error ?? 'Request failed'); return null; }
    setOk(success); onDone?.(r.data); router.refresh();
    return r.data;
  }
  return { busy, error, ok, run, setError, setOk };
}

const Msg = ({ error, ok }: { error: string | null; ok: string | null }) =>
  error ? <div className="msg err" role="alert">{error}</div> : ok ? <div className="msg ok">{ok}</div> : null;

const Field = ({ label, children }: { label: string; children: ReactNode }) => <div><label>{label}</label>{children}</div>;
const fd = (e: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;

// ---------------------------------------------------------------- auth
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null);
    const r = await call('/api/auth/login', 'POST', fd(e));
    if (r.ok) { router.replace('/overview'); router.refresh(); } else { setError(r.data?.error ?? 'Sign-in failed'); setBusy(false); }
  }
  return (
    <form onSubmit={submit} autoComplete="on">
      <div className="f"><label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required autoFocus /></div>
      <div className="f"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <Msg error={error} ok={null} />
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return <button className="btn secondary sm" onClick={async () => { await call('/api/auth/logout', 'POST'); router.replace('/login'); router.refresh(); }}>Sign out</button>;
}

// ---------------------------------------------------------------- sweeps
export type PlanRow = {
  account_id: number; account_label: string; action: string; source_label: string | null; destination_label: string | null;
  source_currency: string | null; destination_currency: string | null; amount_source: string | null; fee_amount: string | null;
  fx_rate: string | null; amount_destination: string | null; hops: number | null; latency_minutes: number | null;
  reason: string; route_text: string | null; fee_base: string | null; amount_base: string | null; base_currency: string;
};

export function ExecutePanel({ rows, canExecute }: { rows: PlanRow[]; canExecute: boolean }) {
  const router = useRouter();
  const actionable = rows.filter((r) => r.action === 'SWEEP' || r.action === 'FUND');
  const [sel, setSel] = useState<Set<number>>(new Set(actionable.map((r) => r.account_id)));
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { busy, error, run } = useSubmit();
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = actionable.filter((r) => sel.has(r.account_id));
  const base = rows[0]?.base_currency ?? '';
  const totalFee = chosen.reduce((a, r) => a + Number(r.fee_base ?? 0), 0);
  const totalVol = chosen.reduce((a, r) => a + Number(r.amount_base ?? 0), 0);

  async function execute() {
    const d = await run('/api/sweeps/execute', 'POST', { accountIds: [...sel], note: note || undefined });
    if (d?.batchId) router.push(`/sweeps/batches/${d.batchId}`);
  }

  return (
    <div>
      <div className="tbl-wrap">
        <table>
          <thead><tr>
            {canExecute && <th style={{ width: 34 }}></th>}
            <th>Account</th><th>Action</th><th>From → To</th><th className="num">Amount sent</th><th className="num">Fee</th>
            <th className="num">FX rate</th><th className="num">Amount received</th><th>Route</th><th>Detail</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const act = r.action === 'SWEEP' || r.action === 'FUND';
              return (
                <tr key={r.account_id}>
                  {canExecute && <td>{act && <input type="checkbox" aria-label={`Include ${r.account_label}`} checked={sel.has(r.account_id)} onChange={() => toggle(r.account_id)} style={{ width: 16, height: 16 }} />}</td>}
                  <td>{r.account_label}</td>
                  <td><ActionTag a={r.action} /></td>
                  <td>{act ? <>{r.source_label}<span className="muted"> → </span>{r.destination_label}</> : <span className="muted">—</span>}</td>
                  <td className="num">{act ? fmtMoney(r.amount_source, r.source_currency!) : ''}</td>
                  <td className="num">{act ? fmtMoney(r.fee_amount, r.source_currency!) : ''}</td>
                  <td className="num">{act && r.source_currency !== r.destination_currency ? fmtRate(r.fx_rate!) : act ? '1' : ''}</td>
                  <td className="num">{act ? fmtMoney(r.amount_destination, r.destination_currency!) : ''}</td>
                  <td className="route">{act ? <span>{r.route_text ?? 'Book transfer'}<span className="muted"> · {duration(r.latency_minutes)}</span></span> : ''}</td>
                  <td className="muted">{r.reason}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No operating accounts.</td></tr>}
          </tbody>
          {actionable.length > 0 && (
            <tfoot><tr className="total">
              {canExecute && <td></td>}
              <td colSpan={3}>{chosen.length} of {actionable.length} transfers selected</td>
              <td className="num" colSpan={2}>Volume {fmtMoney(totalVol, base)}</td>
              <td className="num" colSpan={5}>Total fees {fmtMoney(totalFee, base)}</td>
            </tr></tfoot>
          )}
        </table>
      </div>

      {canExecute && actionable.length > 0 && (
        <div className="panel panel-pad" style={{ marginTop: 14 }}>
          <div className="inline-form">
            <div style={{ flex: 1, minWidth: 260 }}><label htmlFor="note">Batch note (optional)</label><input id="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Month-end cash concentration" /></div>
            {!confirm
              ? <button className="btn" disabled={chosen.length === 0} onClick={() => setConfirm(true)}>Review and execute</button>
              : <>
                  <span className="note">Execute {chosen.length} transfer{chosen.length === 1 ? '' : 's'}? Balances are re-checked against live data at execution.</span>
                  <button className="btn" disabled={busy} onClick={execute}>{busy ? 'Executing…' : 'Confirm'}</button>
                  <button className="btn secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
                </>}
          </div>
          <Msg error={error} ok={null} />
        </div>
      )}
      {!canExecute && <p className="note" style={{ marginTop: 10 }}>Your role can view the plan but not execute it.</p>}
    </div>
  );
}

function ActionTag({ a }: { a: string }) {
  const map: Record<string, [string, string]> = {
    SWEEP: ['Sweep to treasury', 'acc'], FUND: ['Fund from treasury', 'warn'], NONE: ['No action', ''],
    NO_ROUTE: ['No route', 'neg'], INSUFFICIENT_TREASURY: ['Treasury short', 'neg']
  };
  const [t, c] = map[a] ?? [a, ''];
  return <span className={`tag ${c}`}>{t}</span>;
}

// ---------------------------------------------------------------- accounts
export function BalanceForm({ accountId, current, currency }: { accountId: number; current: string; currency: string }) {
  const { busy, error, ok, run } = useSubmit();
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const v = fd(e); run(`/api/accounts/${accountId}/balance`, 'POST', v, 'Balance updated'); }}>
      <Field label={`New balance (${currency})`}><input name="newBalance" defaultValue={current} inputMode="decimal" required /></Field>
      <div style={{ flex: 1, minWidth: 220 }}><label>Reason</label><input name="reason" placeholder="e.g. Bank statement 04 Nov" maxLength={200} /></div>
      <button className="btn" disabled={busy}>Post balance</button>
      <div style={{ flexBasis: '100%' }}><Msg error={error} ok={ok} /></div>
    </form>
  );
}

export function AccountSettings({ a }: { a: { account_id: number; nickname: string; min_reserve: string; min_sweep_amount: string; status: string; currency: string } }) {
  const router = useRouter();
  const { busy, error, ok, run } = useSubmit();
  return (
    <div>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); run(`/api/accounts/${a.account_id}`, 'PATCH', fd(e), 'Account updated'); }}>
        <Field label="Nickname"><input name="nickname" defaultValue={a.nickname} required /></Field>
        <Field label={`Minimum reserve (${a.currency})`}><input name="minReserve" defaultValue={a.min_reserve} inputMode="decimal" /></Field>
        <Field label={`Sweep threshold (${a.currency})`}><input name="minSweepAmount" defaultValue={a.min_sweep_amount} inputMode="decimal" /></Field>
        <Field label="Status"><select name="status" defaultValue={a.status}><option>ACTIVE</option><option>FROZEN</option><option>CLOSED</option></select></Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy}>Save changes</button>
          <button type="button" className="btn danger" disabled={busy} onClick={async () => {
            if (!confirm('Delete this account permanently? Only possible if it has no transfer history.')) return;
            const d = await run(`/api/accounts/${a.account_id}`, 'DELETE', undefined, 'Deleted'); if (d) router.replace('/accounts');
          }}>Delete</button>
        </div>
      </form>
      <Msg error={error} ok={ok} />
    </div>
  );
}

export function NewAccountForm({ subsidiaries, banks, currencies }: { subsidiaries: { subsidiary_id: number; name: string }[]; banks: { bank_id: number; name: string }[]; currencies: { code: string }[] }) {
  const { busy, error, ok, run } = useSubmit();
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const v = fd(e); const d = await run('/api/accounts', 'POST', v, 'Account created'); if (d) f.reset(); }}>
      <div className="form-grid">
        <Field label="Subsidiary"><select name="subsidiaryId" required>{subsidiaries.map((s) => <option key={s.subsidiary_id} value={s.subsidiary_id}>{s.name}</option>)}</select></Field>
        <Field label="Bank"><select name="bankId" required>{banks.map((b) => <option key={b.bank_id} value={b.bank_id}>{b.name}</option>)}</select></Field>
        <Field label="Currency"><select name="currency">{currencies.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
        <Field label="Type"><select name="accountType"><option>OPERATING</option><option>TREASURY</option></select></Field>
        <Field label="Nickname"><input name="nickname" required maxLength={80} /></Field>
        <Field label="Account number"><input name="accountNumber" required pattern="[A-Za-z0-9\-]{5,34}" title="5-34 letters, digits or hyphens" /></Field>
        <Field label="Opening balance"><input name="openingBalance" defaultValue="0" inputMode="decimal" /></Field>
        <Field label="Minimum reserve"><input name="minReserve" defaultValue="0" inputMode="decimal" /></Field>
        <Field label="Sweep threshold"><input name="minSweepAmount" defaultValue="1000" inputMode="decimal" /></Field>
        <div><button className="btn" disabled={busy}>Create account</button></div>
      </div>
      <Msg error={error} ok={ok} />
    </form>
  );
}

// ---------------------------------------------------------------- rates
export function RateForm({ currencies }: { currencies: { code: string }[] }) {
  const { busy, error, ok, run } = useSubmit();
  return (
    <form onSubmit={(e) => { e.preventDefault(); run('/api/rates', 'POST', fd(e), 'Rate recorded'); }}>
      <div className="inline-form">
        <Field label="Base"><select name="base" defaultValue="USD">{currencies.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
        <Field label="Quote"><select name="quote" defaultValue="EUR">{currencies.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
        <Field label="Rate (1 base = x quote)"><input name="rate" inputMode="decimal" required placeholder="0.92400000" /></Field>
        <button className="btn" disabled={busy}>Record rate</button>
      </div>
      <Msg error={error} ok={ok} />
    </form>
  );
}

// ---------------------------------------------------------------- corridors
type Corridor = { corridor_id: number; source_bank: string; destination_bank: string; fee_flat: string; fee_currency: string; fee_percent: string; latency_minutes: number; status: string; uses: string };

export function CorridorTable({ rows, canEdit }: { rows: Corridor[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<number | null>(null);
  const { busy, error, run } = useSubmit(() => setEditing(null));
  return (
    <>
      <div className="tbl-wrap"><table>
        <thead><tr><th>From</th><th>To</th><th className="num">Flat fee</th><th className="num">Variable fee</th><th className="num">Latency</th><th>Status</th><th className="num">Used</th>{canEdit && <th></th>}</tr></thead>
        <tbody>{rows.map((c) => editing === c.corridor_id ? (
          <tr key={c.corridor_id}><td colSpan={canEdit ? 8 : 7}>
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(`/api/corridors/${c.corridor_id}`, 'PATCH', fd(e)); }}>
              <strong style={{ minWidth: 260 }}>{c.source_bank} → {c.destination_bank}</strong>
              <Field label="Flat fee"><input name="feeFlat" defaultValue={c.fee_flat} /></Field>
              <Field label="Fee currency"><input name="feeCurrency" defaultValue={c.fee_currency.trim()} maxLength={3} /></Field>
              <Field label="Variable fee %"><input name="feePercent" defaultValue={c.fee_percent} /></Field>
              <Field label="Latency (min)"><input name="latencyMinutes" defaultValue={c.latency_minutes} /></Field>
              <Field label="Status"><select name="status" defaultValue={c.status}><option>ACTIVE</option><option>SUSPENDED</option></select></Field>
              <button className="btn sm" disabled={busy}>Save</button>
              <button type="button" className="btn secondary sm" onClick={() => setEditing(null)}>Cancel</button>
            </form>
          </td></tr>
        ) : (
          <tr key={c.corridor_id}>
            <td>{c.source_bank}</td><td>{c.destination_bank}</td>
            <td className="num">{fmtMoney(c.fee_flat, c.fee_currency.trim())}</td>
            <td className="num">{Number(c.fee_percent).toFixed(4)}%</td>
            <td className="num">{duration(c.latency_minutes)}</td>
            <td><span className={`tag ${c.status === 'ACTIVE' ? 'pos' : 'neg'}`}>{c.status === 'ACTIVE' ? 'Active' : 'Suspended'}</span></td>
            <td className="num">{c.uses}</td>
            {canEdit && <td><div className="row-actions">
              <button className="btn secondary sm" onClick={() => setEditing(c.corridor_id)}>Edit</button>
              <button className="btn danger sm" onClick={() => { if (confirm('Delete this corridor?')) run(`/api/corridors/${c.corridor_id}`, 'DELETE'); }}>Delete</button>
            </div></td>}
          </tr>
        ))}</tbody>
      </table></div>
      <Msg error={error} ok={null} />
    </>
  );
}

export function NewCorridorForm({ banks, currencies }: { banks: { bank_id: number; name: string }[]; currencies: { code: string }[] }) {
  const { busy, error, ok, run } = useSubmit();
  return (
    <form onSubmit={(e) => { e.preventDefault(); run('/api/corridors', 'POST', fd(e), 'Corridor created'); }}>
      <div className="form-grid">
        <Field label="From bank"><select name="sourceBankId">{banks.map((b) => <option key={b.bank_id} value={b.bank_id}>{b.name}</option>)}</select></Field>
        <Field label="To bank"><select name="destinationBankId" defaultValue={banks[1]?.bank_id}>{banks.map((b) => <option key={b.bank_id} value={b.bank_id}>{b.name}</option>)}</select></Field>
        <Field label="Flat fee"><input name="feeFlat" defaultValue="0" inputMode="decimal" /></Field>
        <Field label="Fee currency"><select name="feeCurrency">{currencies.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
        <Field label="Variable fee (%)"><input name="feePercent" defaultValue="0.0500" inputMode="decimal" /></Field>
        <Field label="Latency (minutes)"><input name="latencyMinutes" defaultValue="240" inputMode="numeric" /></Field>
        <div><button className="btn" disabled={busy}>Add corridor</button></div>
      </div>
      <Msg error={error} ok={ok} />
    </form>
  );
}

export function RouteFinder({ banks, currencies }: { banks: { bank_id: number; name: string }[]; currencies: { code: string }[] }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null);
    const v = fd(e); const q = new URLSearchParams(v).toString();
    const r = await call(`/api/routes?${q}`, 'GET'); setBusy(false);
    if (r.ok) setRows(r.data); else { setError(r.data?.error ?? 'Lookup failed'); setRows(null); }
  }
  return (
    <div>
      <form onSubmit={go}><div className="form-grid">
        <Field label="From bank"><select name="from">{banks.map((b) => <option key={b.bank_id} value={b.bank_id}>{b.name}</option>)}</select></Field>
        <Field label="To bank"><select name="to" defaultValue={banks[0]?.bank_id}>{banks.map((b) => <option key={b.bank_id} value={b.bank_id}>{b.name}</option>)}</select></Field>
        <Field label="Amount"><input name="amount" defaultValue="100000" inputMode="decimal" /></Field>
        <Field label="Currency"><select id="rf-ccy" name="currency" defaultValue="USD">{currencies.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
        <div><button className="btn" disabled={busy}>Find cheapest route</button></div>
      </div></form>
      <Msg error={error} ok={null} />
      {rows && (
        <div className="tbl-wrap" style={{ marginTop: 14 }}><table>
          <thead><tr><th>Path</th><th className="num">Hops</th><th className="num">Flat fees</th><th className="num">Variable</th><th className="num">Total fee</th><th className="num">Latency</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td>{r.path_text}{i === 0 && <span className="tag pos" style={{ marginLeft: 10 }}>Cheapest</span>}</td>
                <td className="num">{r.hops}</td><td className="num">{num(r.total_flat)}</td><td className="num">{Number(r.total_percent).toFixed(4)}%</td>
                <td className="num">{num(r.total_fee)}</td><td className="num">{duration(r.latency_minutes)}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No active route between these banks.</td></tr>}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- administration
type U = { user_id: number; username: string; full_name: string; email: string; role: string; is_active: boolean; last_login_at: string | null };

export function UsersPanel({ users, selfId }: { users: U[]; selfId: number }) {
  const { busy, error, ok, run } = useSubmit();
  return (
    <div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.user_id}>
            <td>{u.full_name}</td><td className="mono">{u.username}</td><td>{u.email}</td>
            <td><select style={{ height: 26, width: 118 }} value={u.role} disabled={busy} onChange={(e) => run(`/api/users/${u.user_id}`, 'PATCH', { role: e.target.value }, 'Role updated')}>
              <option>ADMIN</option><option>TREASURER</option><option>ANALYST</option></select></td>
            <td><span className={`tag ${u.is_active ? 'pos' : ''}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
            <td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString('en-GB', { timeZone: 'UTC' }) : 'Never'}</td>
            <td><div className="row-actions">
              <button className="btn secondary sm" disabled={busy} onClick={() => run(`/api/users/${u.user_id}`, 'PATCH', { isActive: !u.is_active }, u.is_active ? 'User disabled' : 'User enabled')}>{u.is_active ? 'Disable' : 'Enable'}</button>
              <button className="btn secondary sm" disabled={busy} onClick={() => { const p = prompt(`New password for ${u.username} (10+ chars, upper, lower, digit):`); if (p) run(`/api/users/${u.user_id}`, 'PATCH', { password: p }, 'Password reset'); }}>Reset password</button>
              {u.user_id !== selfId && <button className="btn danger sm" disabled={busy} onClick={() => { if (confirm(`Delete ${u.username}?`)) run(`/api/users/${u.user_id}`, 'DELETE', undefined, 'User deleted'); }}>Delete</button>}
            </div></td>
          </tr>))}
        </tbody>
      </table></div>
      <Msg error={error} ok={ok} />
    </div>
  );
}

export function NewUserForm() {
  const { busy, error, ok, run } = useSubmit();
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const d = await run('/api/users', 'POST', fd(e), 'User created'); if (d) f.reset(); }}>
      <div className="form-grid">
        <Field label="Full name"><input name="fullName" required /></Field>
        <Field label="Username"><input name="username" required autoComplete="off" /></Field>
        <Field label="Email"><input name="email" type="email" required /></Field>
        <Field label="Role"><select name="role" defaultValue="ANALYST"><option>ADMIN</option><option>TREASURER</option><option>ANALYST</option></select></Field>
        <Field label="Initial password"><input name="password" type="password" required autoComplete="new-password" /></Field>
        <div><button className="btn" disabled={busy}>Create user</button></div>
      </div>
      <Msg error={error} ok={ok} />
    </form>
  );
}

export function StructurePanel({ subs, banks }: { subs: { subsidiary_id: number; name: string; country: string; accounts: string }[]; banks: { bank_id: number; name: string; swift_bic: string; country: string }[] }) {
  const sub = useSubmit(); const bank = useSubmit();
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Subsidiary</th><th>Country</th><th className="num">Accounts</th><th></th></tr></thead>
          <tbody>{subs.map((s) => (
            <tr key={s.subsidiary_id}><td>{s.name}</td><td>{s.country}</td><td className="num">{s.accounts}</td>
              <td><div className="row-actions">
                <button className="btn secondary sm" onClick={() => { const n = prompt('Subsidiary name', s.name); if (n) sub.run(`/api/subsidiaries/${s.subsidiary_id}`, 'PATCH', { name: n, country: s.country }, 'Updated'); }}>Rename</button>
                <button className="btn danger sm" onClick={() => { if (confirm(`Delete ${s.name}?`)) sub.run(`/api/subsidiaries/${s.subsidiary_id}`, 'DELETE', undefined, 'Deleted'); }}>Delete</button>
              </div></td></tr>))}
          </tbody>
        </table></div>
        <form className="inline-form" style={{ marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const d = await sub.run('/api/subsidiaries', 'POST', fd(e), 'Subsidiary added'); if (d) f.reset(); }}>
          <div style={{ flex: 1 }}><label>New subsidiary</label><input name="name" required /></div>
          <div style={{ minWidth: 80, width: 80 }}><label>Country</label><input name="country" maxLength={2} required placeholder="US" /></div>
          <button className="btn" disabled={sub.busy}>Add</button>
        </form>
        <Msg error={sub.error} ok={sub.ok} />
      </div>
      <div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Bank</th><th>SWIFT / BIC</th><th>Country</th></tr></thead>
          <tbody>{banks.map((b) => <tr key={b.bank_id}><td>{b.name}</td><td className="mono">{b.swift_bic}</td><td>{b.country}</td></tr>)}</tbody>
        </table></div>
        <form className="inline-form" style={{ marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const d = await bank.run('/api/banks', 'POST', fd(e), 'Bank added'); if (d) f.reset(); }}>
          <div style={{ flex: 1 }}><label>New bank</label><input name="name" required /></div>
          <div style={{ width: 120 }}><label>SWIFT / BIC</label><input name="swiftBic" required maxLength={11} /></div>
          <div style={{ width: 70 }}><label>Country</label><input name="country" maxLength={2} required /></div>
          <button className="btn" disabled={bank.busy}>Add</button>
        </form>
        <Msg error={bank.error} ok={bank.ok} />
      </div>
    </div>
  );
}
