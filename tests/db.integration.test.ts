// Integration tests against a throw-away PostgreSQL database built from db/postgres/init/*.sql.
// Requires a reachable server: TEST_PG_URL (default postgresql://postgres@localhost:5432/postgres)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_URL = process.env.TEST_PG_URL ?? 'postgresql://postgres@localhost:5432/postgres';
const DB = 'ccms_test';
let admin: Client; let db: Client;

const uid = async (username: string) => (await db.query('SELECT user_id FROM users WHERE username=$1', [username])).rows[0].user_id as number;
/** Runs fn in a transaction that is always rolled back, returning the error message if it threw. */
async function rolledBack(fn: () => Promise<unknown>): Promise<{ error?: string; value?: unknown }> {
  await db.query('BEGIN');
  try { const value = await fn(); return { value }; }
  catch (e: any) { return { error: e.message as string }; }
  finally { await db.query('ROLLBACK'); }
}

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`CREATE DATABASE ${DB}`);
  const u = new URL(ADMIN_URL); u.pathname = `/${DB}`;
  db = new Client({ connectionString: u.toString() }); await db.connect();
  const dir = path.join(__dirname, '../db/postgres/init');
  for (const f of fs.readdirSync(dir).filter((x) => /^0[1-7]_.*\.sql$/.test(x)).sort()) await db.query(fs.readFileSync(path.join(dir, f), 'utf8'));
});
afterAll(async () => { await db.end(); await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.end(); });

describe('schema & constraints', () => {
  it('rejects a negative balance', async () => {
    expect((await rolledBack(() => db.query('UPDATE bank_accounts SET balance=-1 WHERE account_id=2'))).error).toMatch(/ck_balance_nonneg/);
  });
  it('refuses to close an account that still holds funds', async () => {
    expect((await rolledBack(() => db.query(`UPDATE bank_accounts SET status='CLOSED' WHERE account_id=2`))).error).toMatch(/ck_closed_requires_zero/);
  });
  it('stores only bcrypt hashes in users.password_hash', async () => {
    const r = await rolledBack(() => db.query(`INSERT INTO users(corp_id,username,full_name,email,password_hash,role) VALUES (1,'plain.user','X','x@y.zz','plaintext','ANALYST')`));
    expect(r.error).toMatch(/ck_pwd_is_hash/);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM users WHERE password_hash !~ '^\\$2[aby]\\$'`);
    expect(rows[0].n).toBe(0);
  });
  it('allows only one open treasury account per corporation', async () => {
    const r = await rolledBack(() => db.query(`INSERT INTO bank_accounts(corp_id,subsidiary_id,bank_id,currency,nickname,account_number,account_type) VALUES (1,1,1,'USD','Second treasury','US-XX-12345','TREASURY')`));
    expect(r.error).toMatch(/uq_one_treasury_per_corp/);
  });
  it('blocks an account from referencing a subsidiary of another corporation', async () => {
    const r = await rolledBack(() => db.query(`INSERT INTO bank_accounts(corp_id,subsidiary_id,bank_id,currency,nickname,account_number) VALUES (1,8,1,'USD','Cross tenant','US-XX-99999')`));
    expect(r.error).toMatch(/fk_account_subsidiary/);
  });
  it('rejects a corridor from a bank to itself', async () => {
    expect((await rolledBack(() => db.query(`INSERT INTO routing_corridors(source_bank_id,destination_bank_id,latency_minutes,fee_currency) VALUES (1,1,5,'USD')`))).error).toMatch(/ck_corridor_banks/);
  });
  it('freezes currency of accounts that already have transfers', async () => {
    expect((await rolledBack(() => db.query(`UPDATE bank_accounts SET currency='EUR' WHERE account_id=2`))).error).toMatch(/cannot change after transfers exist/);
  });
});

describe('append-only ledgers (triggers)', () => {
  it('blocks UPDATE and DELETE on sweep_transactions', async () => {
    expect((await rolledBack(() => db.query(`UPDATE sweep_transactions SET memo='x' WHERE txn_id=1`))).error).toMatch(/append-only/);
    expect((await rolledBack(() => db.query(`DELETE FROM sweep_transactions WHERE txn_id=1`))).error).toMatch(/append-only/);
  });
  it('blocks UPDATE and DELETE on exchange_rates', async () => {
    expect((await rolledBack(() => db.query(`UPDATE exchange_rates SET rate=2 WHERE rate_id=1`))).error).toMatch(/append-only/);
    expect((await rolledBack(() => db.query(`DELETE FROM exchange_rates WHERE rate_id=1`))).error).toMatch(/append-only/);
  });
  it('rejects a SWEEP whose destination is not the treasury account', async () => {
    const t = await uid('treasurer.ardent');
    const r = await rolledBack(async () => {
      await db.query('INSERT INTO sweep_batches(corp_id,initiated_by) VALUES (1,$1)', [t]);
      await db.query(`INSERT INTO sweep_transactions(batch_id,transfer_type,source_account_id,destination_account_id,source_currency,destination_currency,amount_source,fx_rate,amount_destination)
                      VALUES ((SELECT max(batch_id) FROM sweep_batches),'SWEEP',2,3,'USD','GBP',100,0.79,79)`);
    });
    expect(r.error).toMatch(/operating account to the treasury/);
  });
  it('rejects an amount inconsistent with the exchange rate', async () => {
    const t = await uid('treasurer.ardent');
    const r = await rolledBack(async () => {
      await db.query('INSERT INTO sweep_batches(corp_id,initiated_by) VALUES (1,$1)', [t]);
      await db.query(`INSERT INTO sweep_transactions(batch_id,transfer_type,source_account_id,destination_account_id,source_currency,destination_currency,amount_source,fx_rate,amount_destination)
                      VALUES ((SELECT max(batch_id) FROM sweep_batches),'SWEEP',3,1,'GBP','USD',100,1.26,500)`);
    });
    expect(r.error).toMatch(/inconsistent with the applied exchange rate/);
  });
});

describe('exchange rates & routing', () => {
  it('derives cross rates through USD and inverse pairs', async () => {
    const { rows } = await db.query(`SELECT get_fx_rate('EUR','USD') AS eur_usd, get_fx_rate('JPY','INR') AS jpy_inr, get_fx_rate('GBP','EUR') AS gbp_eur`);
    expect(Number(rows[0].eur_usd)).toBeCloseTo(1 / 0.924, 5);
    expect(Number(rows[0].jpy_inr)).toBeCloseTo(83.4 / 151.2, 5);
    expect(Number(rows[0].gbp_eur)).toBeCloseTo(1 / 0.856, 5);
  });
  it('picks the cheaper two-hop route over the expensive direct corridor (HDFC -> JPM)', async () => {
    const { rows } = await db.query(`SELECT * FROM find_routes(8,1,17500000,'INR')`);
    expect(rows.length).toBe(2);
    expect(rows[0].hops).toBe(2); expect(rows[0].bank_path).toEqual([8, 6, 1]);
    expect(Number(rows[0].total_fee)).toBeLessThan(Number(rows[1].total_fee));
  });
  it('ignores suspended corridors (MUFG -> JPM must go through DBS)', async () => {
    const { rows } = await db.query(`SELECT * FROM find_best_route(5,1,50000000,'JPY')`);
    expect(rows[0].bank_path).toEqual([5, 6, 1]);
  });
  it('treats same-bank transfers as zero-cost book transfers', async () => {
    const { rows } = await db.query(`SELECT * FROM find_routes(3,3,1000,'GBP')`);
    expect(rows).toHaveLength(1); expect(Number(rows[0].total_fee)).toBe(0); expect(rows[0].hops).toBe(0);
  });
  it('returns no route when none exists', async () => {
    expect((await db.query(`SELECT * FROM find_routes(10,6,1000,'GBP')`)).rows).toHaveLength(0);
  });
});

describe('sweep planning', () => {
  it('plans sweeps for surplus accounts and funding for deficit accounts', async () => {
    const { rows } = await db.query(`SELECT * FROM plan_cash_position(1)`);
    const by = Object.fromEntries(rows.map((r) => [r.account_id, r]));
    expect(by[2].action).toBe('SWEEP'); expect(by[4].action).toBe('FUND'); expect(by[8].action).toBe('FUND');
    expect(by[12].action).toBe('NONE');            // surplus below threshold
    expect(by[13].reason).toMatch(/FROZEN/);       // frozen accounts are never swept
  });
  it('never plans a transfer that leaves the sender below its reserve', async () => {
    const { rows } = await db.query(`
      SELECT p.account_id FROM plan_cash_position(1) p JOIN bank_accounts a ON a.account_id = p.source_account_id
       WHERE p.action IN ('SWEEP','FUND') AND a.balance - p.amount_source - p.fee_amount < a.min_reserve`);
    expect(rows).toHaveLength(0);
  });
  it('flags an account as NO_ROUTE when its only corridors are suspended', async () => {
    const r = await rolledBack(async () => {
      await db.query(`UPDATE routing_corridors SET status='SUSPENDED' WHERE source_bank_id=3 AND destination_bank_id=1`);
      return (await db.query(`SELECT action FROM plan_cash_position(1) WHERE account_id=3`)).rows[0].action;
    });
    expect(r.value).toBe('NO_ROUTE');
  });
  it('limits funding to the treasury surplus over its own reserve', async () => {
    const r = await rolledBack(async () => {
      await db.query(`UPDATE bank_accounts SET balance = 1000010 WHERE account_id = 1`);
      return (await db.query(`SELECT action FROM plan_cash_position(1) WHERE account_id=4`)).rows[0].action;
    });
    expect(r.value).toBe('INSUFFICIENT_TREASURY');
  });
});

describe('batch execution (transactions)', () => {
  it('denies analysts and users of another corporation', async () => {
    const a = await uid('analyst.ardent'); const o = await uid('treasurer.brightwater');
    expect((await rolledBack(() => db.query('SELECT execute_sweep_batch(1,$1)', [a]))).error).toMatch(/not authorised/);
    expect((await rolledBack(() => db.query('SELECT execute_sweep_batch(1,$1)', [o]))).error).toMatch(/not authorised/);
  });
  it('moves money atomically, keeps every reserve and writes an audit trail', async () => {
    const t = await uid('treasurer.ardent');
    const r = await rolledBack(async () => {
      const before = Number((await db.query(`SELECT sum(balance_base) AS s FROM v_account_positions WHERE corp_id=1`)).rows[0].s);
      const batch = (await db.query('SELECT execute_sweep_batch(1,$1,NULL,$2) AS b', [t, 'unit test'])).rows[0].b;
      const st = (await db.query(`SELECT status, count(*)::int AS n FROM sweep_transactions WHERE batch_id=$1 GROUP BY status`, [batch])).rows;
      const breach = (await db.query(`SELECT count(*)::int AS n FROM bank_accounts WHERE corp_id=1 AND status='ACTIVE' AND account_type='OPERATING' AND balance < min_reserve`)).rows[0].n;
      const hist = (await db.query(`SELECT count(*)::int AS n FROM balance_history WHERE txn_id IN (SELECT txn_id FROM sweep_transactions WHERE batch_id=$1) AND changed_by=$2`, [batch, t])).rows[0].n;
      const after = Number((await db.query(`SELECT sum(balance_base) AS s FROM v_account_positions WHERE corp_id=1`)).rows[0].s);
      const again = await db.query('SAVEPOINT s2').then(() => db.query('SELECT execute_sweep_batch(1,$1)', [t])).catch((e) => e.message);
      return { st, breach, hist, lost: before - after, again };
    });
    const v = r.value as any;
    expect(v.st).toEqual([{ status: 'COMPLETED', n: 10 }]);
    expect(v.breach).toBe(0);
    expect(v.hist).toBe(20);                 // two balance changes per transfer
    expect(v.lost).toBeGreaterThan(0);       // only fees leave the system (plus rounding)
    expect(v.lost).toBeLessThan(15000);
    expect(String(v.again)).toMatch(/No eligible transfers/);
  });
  it('records a failed transfer, continues the batch and flags it PARTIAL (savepoints)', async () => {
    const t = await uid('treasurer.ardent');
    const r = await rolledBack(async () => {
      await db.query(`CREATE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'injected failure'; END $f$`);
      await db.query(`CREATE TRIGGER boom_t BEFORE UPDATE OF balance ON bank_accounts FOR EACH ROW WHEN (OLD.account_id = 10) EXECUTE FUNCTION boom()`);
      const batch = (await db.query('SELECT execute_sweep_batch(1,$1) AS b', [t])).rows[0].b;
      const s = (await db.query('SELECT status FROM sweep_batches WHERE batch_id=$1', [batch])).rows[0].status;
      const f = (await db.query(`SELECT source_account_id, failure_reason FROM sweep_transactions WHERE batch_id=$1 AND status='FAILED'`, [batch])).rows;
      const bal = (await db.query('SELECT balance FROM bank_accounts WHERE account_id=10')).rows[0].balance;
      return { s, f, bal };
    });
    const v = r.value as any;
    expect(v.s).toBe('PARTIAL'); expect(v.f).toEqual([{ source_account_id: 10, failure_reason: 'injected failure' }]);
    expect(v.bal).toBe('5900000.00');        // failed transfer fully rolled back
  });
  it('lets only operators post balance updates and logs them', async () => {
    const a = await uid('analyst.ardent'); const t = await uid('treasurer.ardent');
    expect((await rolledBack(() => db.query(`SELECT post_balance_update(2,1900000,$1,'x')`, [a]))).error).toMatch(/not authorised/);
    const r = await rolledBack(async () => {
      await db.query(`SELECT post_balance_update(2,1900000,$1,'Statement')`, [t]);
      return (await db.query(`SELECT old_balance, new_balance, reason, changed_by FROM balance_history WHERE account_id=2 ORDER BY history_id DESC LIMIT 1`)).rows[0];
    });
    expect(r.value).toEqual({ old_balance: '1820000.00', new_balance: '1900000.00', reason: 'Statement', changed_by: t });
  });
});

describe('search & views', () => {
  it('finds accounts by prefix across bank, subsidiary and country', async () => {
    const names = (await db.query(`SELECT a.nickname FROM search_accounts(1,'sing op') s JOIN bank_accounts a USING(account_id)`)).rows.map((r) => r.nickname);
    expect(names).toContain('Singapore Operating');
    expect((await db.query(`SELECT count(*)::int AS n FROM search_accounts(1,'hsbc')`)).rows[0].n).toBe(2);
    expect((await db.query(`SELECT count(*)::int AS n FROM search_accounts(2,'hsbc')`)).rows[0].n).toBe(0);   // tenant scoped
  });
  it('searches transfer memos with full-text search', async () => {
    expect((await db.query(`SELECT count(*)::int AS n FROM sweep_transactions WHERE memo_tsv @@ websearch_to_tsquery('english','payroll cover')`)).rows[0].n).toBeGreaterThan(0);
  });
  it('re-indexes accounts when a bank is renamed', async () => {
    const r = await rolledBack(async () => {
      await db.query(`UPDATE banks SET name='Zephyr Trust' WHERE bank_id=8`);
      return (await db.query(`SELECT count(*)::int AS n FROM search_accounts(1,'zephyr')`)).rows[0].n;
    });
    expect(r.value).toBe(2);
  });
  it('summarises liquidity per corporation in the base currency', async () => {
    const { rows } = await db.query(`SELECT * FROM v_corporate_liquidity ORDER BY corp_id`);
    expect(rows).toHaveLength(2); expect(rows[0].base_currency.trim()).toBe('USD'); expect(rows[1].base_currency.trim()).toBe('GBP');
    expect(Number(rows[0].accounts_in_deficit)).toBe(3);
  });
});

describe('use of indexes', () => {
  it('uses the GIN index for full-text account search', async () => {
    await db.query('SET enable_seqscan = off');
    const plan = (await db.query(`EXPLAIN SELECT account_id FROM bank_accounts WHERE search_tsv @@ to_tsquery('simple','singapore:*')`)).rows.map((r) => r['QUERY PLAN']).join('\n');
    await db.query('RESET enable_seqscan');
    expect(plan).toMatch(/idx_accounts_search/);
  });
});
