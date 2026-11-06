// End-to-end tests over HTTP against a running server (E2E_BASE_URL, default http://localhost:3000) and a freshly
// seeded database (npm run db:rebuild). The last test executes a real sweep batch.
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = process.env.E2E_E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'Treasury#2026';

async function login(username: string, password = PASSWORD) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { status: res.status, cookie };
}
const api = (cookie: string, path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', cookie, ...(init.headers ?? {}) }, redirect: 'manual' });

let admin = '', treasurer = '', analyst = '', other = '';
beforeAll(async () => {
  admin = (await login('admin.ardent')).cookie; treasurer = (await login('treasurer.ardent')).cookie;
  analyst = (await login('analyst.ardent')).cookie; other = (await login('treasurer.brightwater')).cookie;
});

describe('authentication', () => {
  it('rejects wrong and unknown credentials with the same message', async () => {
    const a = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'treasurer.ardent', password: 'nope' }) });
    const b = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ghost.user', password: 'nope' }) });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect((await a.json()).error).toBe((await b.json()).error);
  });
  it('sets an HttpOnly, SameSite session cookie', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'analyst.ardent', password: PASSWORD }) });
    const c = res.headers.get('set-cookie') ?? '';
    expect(c).toMatch(/HttpOnly/i); expect(c).toMatch(/SameSite=lax/i);
  });
  it('requires a session for APIs and redirects pages to the login screen', async () => {
    expect((await fetch(`${BASE}/api/accounts`)).status).toBe(401);
    const r = await fetch(`${BASE}/overview`, { redirect: 'manual' });
    expect(r.status).toBe(307); expect(r.headers.get('location')).toMatch(/\/login$/);
  });
  it('rejects a forged session token', async () => {
    expect((await api('ccms_session=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjF9.forged', '/api/accounts')).status).toBe(401);
  });
});

describe('authorisation (roles)', () => {
  it('analysts are read-only', async () => {
    expect((await api(analyst, '/api/accounts')).status).toBe(200);
    expect((await api(analyst, '/api/sweeps/execute', { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await api(analyst, '/api/rates', { method: 'POST', body: JSON.stringify({ base: 'USD', quote: 'EUR', rate: '0.9' }) })).status).toBe(403);
    expect((await api(analyst, '/api/users')).status).toBe(403);
    expect((await api(analyst, '/api/audit')).status).toBe(403);
  });
  it('treasurers cannot manage structure or users', async () => {
    expect((await api(treasurer, '/api/accounts', { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await api(treasurer, '/api/users')).status).toBe(403);
    expect((await api(treasurer, '/api/corridors/1', { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED' }) })).status).toBe(403);
  });
  it('non-admins are redirected away from admin pages', async () => {
    const r = await api(analyst, '/admin/users'); expect(r.status).toBe(307);
  });
});

describe('tenant isolation', () => {
  it('each corporation only sees its own accounts and batches', async () => {
    const mine = await (await api(other, '/api/accounts')).json();
    expect(mine.length).toBe(5); expect(mine.every((a: any) => a.corp_id === 2)).toBe(true);
    expect((await api(other, '/api/accounts/2')).status).toBe(404);
    expect((await api(other, '/api/sweeps/batches/1')).status).toBe(404);
  });
});

describe('validation and safety', () => {
  it('validates input with a 400 and field messages', async () => {
    const r = await api(admin, '/api/accounts', { method: 'POST', body: JSON.stringify({ nickname: 'x' }) });
    expect(r.status).toBe(400); expect((await r.json()).code).toBe('VALIDATION');
  });
  it('rejects cross-origin state changes', async () => {
    expect((await api(admin, '/api/accounts', { method: 'POST', body: '{}', headers: { Origin: 'http://evil.example' } })).status).toBe(403);
  });
  it('is not vulnerable to SQL injection in search and filters', async () => {
    const r = await api(treasurer, `/api/accounts?q=${encodeURIComponent("'; DROP TABLE bank_accounts; --")}&currency=${encodeURIComponent("USD' OR '1'='1")}`);
    expect(r.status).toBe(200); expect(await r.json()).toEqual([]);
    expect((await api(treasurer, '/api/accounts')).status).toBe(200);
  });
  it('surfaces database rules as friendly errors', async () => {
    const r = await api(admin, '/api/accounts/2', { method: 'PATCH', body: JSON.stringify({ status: 'CLOSED' }) });
    expect(r.status).toBe(422); expect((await r.json()).error).toMatch(/balance is zero/);
    const d = await api(admin, '/api/accounts/2', { method: 'DELETE' });
    expect(d.status).toBe(409);
  });
  it('enforces password strength and keeps at least one admin', async () => {
    const weak = await api(admin, '/api/users', { method: 'POST', body: JSON.stringify({ username: 'weak.user', fullName: 'Weak User', email: 'w@x.example', password: 'short', role: 'ANALYST' }) });
    expect(weak.status).toBe(400);
    const me = await (await api(admin, '/api/auth/me')).json();
    const demote = await api(admin, `/api/users/${me.userId}`, { method: 'PATCH', body: JSON.stringify({ role: 'ANALYST' }) });
    expect(demote.status).toBe(409);
  });
});

describe('treasury workflows', () => {
  it('returns a sweep plan with routes and base-currency totals', async () => {
    const plan = await (await api(treasurer, '/api/sweeps/plan')).json();
    expect(plan.filter((p: any) => p.action === 'SWEEP').length).toBe(7);
    expect(plan.find((p: any) => p.account_id === 7).hops).toBe(2);
  });
  it('finds routes via the recursive routing function', async () => {
    const r = await (await api(treasurer, '/api/routes?from=8&to=1&amount=17500000&currency=INR')).json();
    expect(r[0].hops).toBe(2); expect(r[0].path_text).toMatch(/HDFC.*DBS.*JPMorgan/);
  });
  it('records a new exchange rate (append-only history)', async () => {
    const r = await api(treasurer, '/api/rates', { method: 'POST', body: JSON.stringify({ base: 'USD', quote: 'EUR', rate: '0.92510000' }) });
    expect(r.status).toBe(200);
    const rates = await (await api(treasurer, '/api/rates')).json();
    expect(rates.find((x: any) => x.base_currency.trim() === 'USD' && x.quote_currency.trim() === 'EUR').rate).toMatch(/^0\.9251/);
  });
  it('posts a statement balance and shows it in the account history', async () => {
    const r = await api(treasurer, '/api/accounts/2/balance', { method: 'POST', body: JSON.stringify({ newBalance: '1850000.00', reason: 'e2e statement' }) });
    expect(r.status).toBe(200);
    const d = await (await api(treasurer, '/api/accounts/2')).json();
    expect(d.history[0]).toMatchObject({ reason: 'e2e statement', new_balance: '1850000.00' });
  });
  it('executes the batch, then reports nothing left to do', async () => {
    const run = await api(treasurer, '/api/sweeps/execute', { method: 'POST', body: JSON.stringify({ note: 'e2e run' }) });
    expect(run.status).toBe(200);
    const { batchId } = await run.json();
    const detail = await (await api(treasurer, `/api/sweeps/batches/${batchId}`)).json();
    expect(detail.batch.status).toBe('COMPLETED'); expect(detail.transfers.length).toBeGreaterThanOrEqual(9);
    const again = await api(treasurer, '/api/sweeps/execute', { method: 'POST', body: '{}' });
    expect(again.status).toBe(422); expect((await again.json()).error).toMatch(/No eligible transfers/);
    const hist = await (await api(treasurer, '/api/sweeps?type=SWEEP&status=COMPLETED')).json();
    expect(hist.total).toBeGreaterThan(0);
  });
});
