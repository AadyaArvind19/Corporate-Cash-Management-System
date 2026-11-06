import { query, one, withTx } from '../db';

export type AccountFilters = { q?: string; subsidiaryId?: number; currency?: string; position?: string; status?: string };

export async function listAccounts(corpId: number, f: AccountFilters = {}) {
  const params: unknown[] = [corpId];
  const where: string[] = ['p.corp_id = $1'];
  let rankJoin = '';
  if (f.q && f.q.trim()) {
    params.push(f.q);
    rankJoin = `JOIN search_accounts($1, $${params.length}) sr ON sr.account_id = p.account_id`;
  }
  if (f.subsidiaryId) { params.push(f.subsidiaryId); where.push(`p.subsidiary_id = $${params.length}`); }
  if (f.currency)     { params.push(f.currency);     where.push(`p.currency = $${params.length}`); }
  if (f.position)     { params.push(f.position);     where.push(`p.cash_position = $${params.length}`); }
  if (f.status)       { params.push(f.status);       where.push(`p.status = $${params.length}::account_status`); }
  return query(
    `SELECT p.* FROM v_account_positions p ${rankJoin}
      WHERE ${where.join(' AND ')}
      ORDER BY ${rankJoin ? 'sr.rank DESC,' : ''} p.account_type DESC, p.subsidiary, p.nickname`, params);
}

export async function getAccount(corpId: number, accountId: number) {
  return one(`SELECT * FROM v_account_positions WHERE corp_id = $1 AND account_id = $2`, [corpId, accountId]);
}

export async function accountHistory(accountId: number, limit = 40) {
  return query(
    `SELECT h.history_id, h.old_balance, h.new_balance, h.new_balance - h.old_balance AS delta,
            h.reason, h.changed_at, u.username AS changed_by, h.txn_id
       FROM balance_history h LEFT JOIN users u ON u.user_id = h.changed_by
      WHERE h.account_id = $1 ORDER BY h.changed_at DESC, h.history_id DESC LIMIT $2`, [accountId, limit]);
}

export async function accountTransfers(accountId: number, limit = 15) {
  return query(
    `SELECT * FROM v_sweep_ledger WHERE source_account_id = $1 OR destination_account_id = $1
      ORDER BY executed_at DESC, txn_id DESC LIMIT $2`, [accountId, limit]);
}

export async function createAccount(corpId: number, userId: number, a: {
  subsidiaryId: number; bankId: number; currency: string; nickname: string; accountNumber: string;
  accountType: 'OPERATING' | 'TREASURY'; openingBalance: string; minReserve: string; minSweepAmount: string;
}) {
  return withTx(async (c) => {
    await c.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    const r = await c.query(
      `INSERT INTO bank_accounts (corp_id, subsidiary_id, bank_id, currency, nickname, account_number, account_type,
                                  balance, min_reserve, min_sweep_amount, last_reconciled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now()) RETURNING account_id`,
      [corpId, a.subsidiaryId, a.bankId, a.currency, a.nickname, a.accountNumber, a.accountType,
       a.openingBalance, a.minReserve, a.minSweepAmount]);
    return r.rows[0].account_id as number;
  });
}

export async function updateAccount(corpId: number, accountId: number, p: {
  nickname?: string; minReserve?: string; minSweepAmount?: string; status?: 'ACTIVE' | 'FROZEN' | 'CLOSED';
}) {
  const sets: string[] = []; const params: unknown[] = [];
  const add = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };
  if (p.nickname !== undefined) add('nickname', p.nickname);
  if (p.minReserve !== undefined) add('min_reserve', p.minReserve);
  if (p.minSweepAmount !== undefined) add('min_sweep_amount', p.minSweepAmount);
  if (p.status !== undefined) { params.push(p.status); sets.push(`status = $${params.length}::account_status`); }
  if (!sets.length) return false;
  params.push(corpId, accountId);
  const rows = await query(
    `UPDATE bank_accounts SET ${sets.join(', ')} WHERE corp_id = $${params.length - 1} AND account_id = $${params.length}
     RETURNING account_id`, params);
  return rows.length > 0;
}

export async function deleteAccount(corpId: number, accountId: number) {
  const rows = await query(`DELETE FROM bank_accounts WHERE corp_id = $1 AND account_id = $2 RETURNING account_id`, [corpId, accountId]);
  return rows.length > 0;
}

export async function postBalance(corpId: number, userId: number, accountId: number, newBalance: string, reason: string) {
  const owner = await one(`SELECT 1 FROM bank_accounts WHERE account_id = $1 AND corp_id = $2`, [accountId, corpId]);
  if (!owner) return false;
  await query(`SELECT post_balance_update($1, $2, $3, $4)`, [accountId, newBalance, userId, reason]);
  return true;
}
