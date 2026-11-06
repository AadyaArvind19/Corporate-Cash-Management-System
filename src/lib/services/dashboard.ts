import { query, one } from '../db';
import { recentBatches } from './sweeps';

export async function dashboard(corpId: number) {
  const [liq, positions, byCurrency, batches, corridorsDown, stale] = await Promise.all([
    one(`SELECT * FROM v_corporate_liquidity WHERE corp_id = $1`, [corpId]),
    query(`SELECT account_id, nickname, subsidiary, currency, account_type, cash_position, status,
                  balance_base, reserve_base, surplus_base, balance, min_reserve
             FROM v_account_positions WHERE corp_id = $1 AND status <> 'CLOSED' ORDER BY balance_base DESC`, [corpId]),
    query(`SELECT currency, sum(balance_base) AS balance_base FROM v_account_positions
            WHERE corp_id = $1 AND status <> 'CLOSED' GROUP BY currency ORDER BY 2 DESC`, [corpId]),
    recentBatches(corpId, 5),
    query(`SELECT c.corridor_id, sb.name AS source_bank, db.name AS destination_bank
             FROM routing_corridors c JOIN banks sb ON sb.bank_id = c.source_bank_id JOIN banks db ON db.bank_id = c.destination_bank_id
            WHERE c.status = 'SUSPENDED' AND (c.source_bank_id IN (SELECT bank_id FROM bank_accounts WHERE corp_id = $1)
                                           OR c.destination_bank_id IN (SELECT bank_id FROM bank_accounts WHERE corp_id = $1))`, [corpId]),
    query(`SELECT account_id, nickname, last_reconciled_at FROM bank_accounts
            WHERE corp_id = $1 AND status = 'ACTIVE' AND (last_reconciled_at IS NULL OR last_reconciled_at < now() - interval '24 hours')
            ORDER BY last_reconciled_at NULLS FIRST`, [corpId])
  ]);
  return { liq, positions, byCurrency, batches, corridorsDown, stale };
}
