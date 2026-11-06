import { query, one } from '../db';
import { coll } from '../mongo';

// ---------------- SQL analytics ----------------
export async function sqlReports(corpId: number, days: number) {
  const [corridorFees, weekly, exposure, aboveAvg, subsidiaryCost] = await Promise.all([
    // GROUP BY + HAVING + aggregate + JOIN
    query(
      `SELECT c.corridor_id, sb.name AS from_bank, db.name AS to_bank,
              count(DISTINCT h.txn_id) AS transfers,
              round(sum(t.fee_amount * get_fx_rate(t.source_currency, co.base_currency, t.executed_at)), 2) AS fees_base,
              round(avg(c.latency_minutes)) AS avg_latency
         FROM sweep_transaction_hops h
         JOIN sweep_transactions t ON t.txn_id = h.txn_id AND t.status = 'COMPLETED'
         JOIN sweep_batches b ON b.batch_id = t.batch_id AND b.corp_id = $1
         JOIN corporations co ON co.corp_id = b.corp_id
         JOIN routing_corridors c ON c.corridor_id = h.corridor_id
         JOIN banks sb ON sb.bank_id = c.source_bank_id
         JOIN banks db ON db.bank_id = c.destination_bank_id
        WHERE t.executed_at >= now() - make_interval(days => $2)
        GROUP BY c.corridor_id, sb.name, db.name
       HAVING count(DISTINCT h.txn_id) >= 2
        ORDER BY fees_base DESC`, [corpId, days]),
    // window function over a grouped subquery
    query(
      `SELECT w.week, w.swept, w.fees, sum(w.swept) OVER (ORDER BY w.week) AS cumulative
         FROM (SELECT date_trunc('week', t.executed_at)::date AS week,
                      round(sum(t.amount_source * get_fx_rate(t.source_currency, co.base_currency, t.executed_at))
                            FILTER (WHERE t.transfer_type = 'SWEEP'), 2) AS swept,
                      round(sum(t.fee_amount * get_fx_rate(t.source_currency, co.base_currency, t.executed_at)), 2) AS fees
                 FROM sweep_transactions t
                 JOIN sweep_batches b ON b.batch_id = t.batch_id AND b.corp_id = $1
                 JOIN corporations co ON co.corp_id = b.corp_id
                WHERE t.status = 'COMPLETED' AND t.executed_at >= now() - make_interval(days => $2)
                GROUP BY 1) w
        ORDER BY w.week`, [corpId, days]),
    // GROUP BY currency over the view
    query(
      `SELECT p.currency, count(*) AS accounts, sum(p.balance) AS balance, sum(p.balance_base) AS balance_base,
              round(100 * sum(p.balance_base) / nullif(sum(sum(p.balance_base)) OVER (), 0), 1) AS share_pct
         FROM v_account_positions p
        WHERE p.corp_id = $1 AND p.status <> 'CLOSED'
        GROUP BY p.currency ORDER BY balance_base DESC`, [corpId]),
    // correlated subquery
    query(
      `SELECT a.account_id, a.nickname, a.currency, a.balance,
              round((SELECT avg(x.balance) FROM bank_accounts x
                      WHERE x.corp_id = a.corp_id AND x.currency = a.currency AND x.account_type = 'OPERATING'), 2) AS currency_avg
         FROM bank_accounts a
        WHERE a.corp_id = $1 AND a.account_type = 'OPERATING' AND a.status = 'ACTIVE'
          AND a.balance > (SELECT avg(x.balance) FROM bank_accounts x
                            WHERE x.corp_id = a.corp_id AND x.currency = a.currency AND x.account_type = 'OPERATING')
        ORDER BY a.currency, a.balance DESC`, [corpId]),
    query(
      `SELECT s.name AS subsidiary, count(*) AS transfers,
              round(sum(t.fee_amount * get_fx_rate(t.source_currency, co.base_currency, t.executed_at)), 2) AS fees_base,
              round(100 * sum(t.fee_amount * get_fx_rate(t.source_currency, co.base_currency, t.executed_at))
                        / nullif(sum(t.amount_source * get_fx_rate(t.source_currency, co.base_currency, t.executed_at)), 0), 3) AS fee_pct
         FROM sweep_transactions t
         JOIN sweep_batches b ON b.batch_id = t.batch_id AND b.corp_id = $1
         JOIN corporations co ON co.corp_id = b.corp_id
         JOIN bank_accounts a ON a.account_id = t.source_account_id
         JOIN subsidiaries s ON s.subsidiary_id = a.subsidiary_id
        WHERE t.status = 'COMPLETED' AND t.transfer_type = 'SWEEP' AND t.executed_at >= now() - make_interval(days => $2)
        GROUP BY s.name HAVING count(*) > 0 ORDER BY fees_base DESC`, [corpId, days])
  ]);
  return { corridorFees, weekly, exposure, aboveAvg, subsidiaryCost };
}

// ---------------- MongoDB aggregation ----------------
import { activityByAction, failedLogins, corridorCost, batchEfficiency } from '../pipelines';

export async function mongoReports(corpId: number, days: number) {
  try {
    const audits = await coll('audit_events');
    const snaps = await coll('sweep_run_snapshots');
    const [activity, failed, corridors, batches] = await Promise.all([
      audits.aggregate(activityByAction(corpId, days)).toArray(),
      audits.aggregate(failedLogins(corpId, days)).toArray(),
      snaps.aggregate(corridorCost(corpId)).toArray(),
      snaps.aggregate(batchEfficiency(corpId)).toArray()
    ]);
    return { available: true as const, activity, failed, corridors, batches };
  } catch (e) {
    return { available: false as const, error: (e as Error).message };
  }
}

export async function auditEvents(corpId: number, f: { action?: string; outcome?: string; username?: string; page?: number }) {
  try {
    const c = await coll('audit_events');
    const filter: any = { corpId };
    if (f.action) filter.action = f.action;
    if (f.outcome) filter.outcome = f.outcome;
    if (f.username) filter['actor.username'] = f.username;
    const page = Math.max(1, f.page ?? 1); const size = 30;
    const [rows, total, actions] = await Promise.all([
      c.find(filter).sort({ ts: -1 }).skip((page - 1) * size).limit(size).toArray(),
      c.countDocuments(filter),
      c.distinct('action', { corpId })
    ]);
    return { available: true as const, rows, total, page, size, actions: actions.sort() };
  } catch (e) {
    return { available: false as const, error: (e as Error).message };
  }
}
