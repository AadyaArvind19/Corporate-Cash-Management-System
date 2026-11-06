import { query, one, withTx } from '../db';
import { coll } from '../mongo';

const ROUTE_TEXT = `
  (SELECT string_agg(x.name, ' › ' ORDER BY x.ord)
     FROM (SELECT 0 AS ord, sb.name FROM routing_corridors c JOIN banks sb ON sb.bank_id = c.source_bank_id
            WHERE c.corridor_id = p.corridor_path[1]
           UNION ALL
           SELECT u.ord, db.name FROM unnest(p.corridor_path) WITH ORDINALITY u(cid, ord)
             JOIN routing_corridors c ON c.corridor_id = u.cid JOIN banks db ON db.bank_id = c.destination_bank_id) x)`;

/** Live plan with labels, route text and base-currency equivalents. */
export async function planSweeps(corpId: number) {
  return query(
    `SELECT p.account_id, p.account_label, p.action, p.source_account_id, p.destination_account_id,
            p.source_currency, p.destination_currency, p.amount_source, p.fee_amount, p.fx_rate,
            p.amount_destination, p.corridor_path, p.hops, p.latency_minutes, p.reason,
            ${ROUTE_TEXT} AS route_text,
            sa.nickname AS source_label, da.nickname AS destination_label,
            CASE WHEN p.fee_amount IS NULL THEN NULL
                 ELSE round(p.fee_amount * get_fx_rate(p.source_currency, c.base_currency), 2) END AS fee_base,
            CASE WHEN p.amount_source IS NULL THEN NULL
                 ELSE round(p.amount_source * get_fx_rate(p.source_currency, c.base_currency), 2) END AS amount_base,
            c.base_currency
       FROM plan_cash_position($1) p
       JOIN corporations c ON c.corp_id = $1
       LEFT JOIN bank_accounts sa ON sa.account_id = p.source_account_id
       LEFT JOIN bank_accounts da ON da.account_id = p.destination_account_id
      ORDER BY CASE p.action WHEN 'SWEEP' THEN 1 WHEN 'FUND' THEN 2 WHEN 'NO_ROUTE' THEN 3
                             WHEN 'INSUFFICIENT_TREASURY' THEN 4 ELSE 5 END, p.account_id`, [corpId]);
}

/** Executes the batch in PostgreSQL (single transaction) and returns the batch id. */
export async function executeBatch(corpId: number, userId: number, accountIds: number[] | null, note: string | null) {
  const rows = await query<{ b: number }>(
    `SELECT execute_sweep_batch($1, $2, $3::int[], $4) AS b`, [corpId, userId, accountIds, note]);
  return rows[0].b;
}

export async function batchDetail(corpId: number, batchId: number) {
  const batch = await one(
    `SELECT b.batch_id, b.corp_id, b.note, b.status, b.created_at, u.username AS initiated_by, u.full_name
       FROM sweep_batches b JOIN users u ON u.user_id = b.initiated_by
      WHERE b.batch_id = $1 AND b.corp_id = $2`, [batchId, corpId]);
  if (!batch) return null;
  const transfers = await query(
    `SELECT l.*, (SELECT string_agg(x.name, ' › ' ORDER BY x.ord)
                    FROM (SELECT 0 AS ord, sb.name FROM sweep_transaction_hops h JOIN routing_corridors c ON c.corridor_id = h.corridor_id
                            JOIN banks sb ON sb.bank_id = c.source_bank_id WHERE h.txn_id = l.txn_id AND h.hop_no = 1
                          UNION ALL
                          SELECT h.hop_no, db.name FROM sweep_transaction_hops h JOIN routing_corridors c ON c.corridor_id = h.corridor_id
                            JOIN banks db ON db.bank_id = c.destination_bank_id WHERE h.txn_id = l.txn_id) x) AS route_text
       FROM v_sweep_ledger l WHERE l.batch_id = $1 ORDER BY l.txn_id`, [batchId]);
  return { batch, transfers };
}

export type HistoryFilters = {
  status?: string; type?: string; accountId?: number; from?: string; to?: string; q?: string; page?: number; pageSize?: number;
};

export async function sweepHistory(corpId: number, f: HistoryFilters) {
  const params: unknown[] = [corpId]; const where = ['l.corp_id = $1'];
  if (f.status)    { params.push(f.status);    where.push(`l.status = $${params.length}::transfer_status`); }
  if (f.type)      { params.push(f.type);      where.push(`l.transfer_type = $${params.length}::transfer_type`); }
  if (f.accountId) { params.push(f.accountId); where.push(`(l.source_account_id = $${params.length} OR l.destination_account_id = $${params.length})`); }
  if (f.from)      { params.push(f.from);      where.push(`l.executed_at >= $${params.length}::date`); }
  if (f.to)        { params.push(f.to);        where.push(`l.executed_at < ($${params.length}::date + 1)`); }
  if (f.q?.trim()) {
    params.push(f.q);
    where.push(`l.txn_id IN (SELECT t.txn_id FROM sweep_transactions t WHERE t.memo_tsv @@ websearch_to_tsquery('english', $${params.length}))`);
  }
  const pageSize = f.pageSize ?? 25; const page = Math.max(1, f.page ?? 1);
  const w = where.join(' AND ');
  const totals = await one<{ n: string }>(`SELECT count(*) AS n FROM v_sweep_ledger l WHERE ${w}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query(
    `SELECT l.* FROM v_sweep_ledger l WHERE ${w}
      ORDER BY l.executed_at DESC, l.txn_id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total: Number(totals?.n ?? 0), page, pageSize };
}

export async function recentBatches(corpId: number, limit = 6) {
  return query(
    `SELECT b.batch_id, b.status, b.created_at, b.note, u.username AS initiated_by,
            count(t.txn_id) FILTER (WHERE t.status = 'COMPLETED') AS completed,
            count(t.txn_id) FILTER (WHERE t.status = 'FAILED')    AS failed
       FROM sweep_batches b
       JOIN users u ON u.user_id = b.initiated_by
       LEFT JOIN sweep_transactions t ON t.batch_id = b.batch_id
      WHERE b.corp_id = $1
      GROUP BY b.batch_id, u.username
      ORDER BY b.created_at DESC, b.batch_id DESC LIMIT $2`, [corpId, limit]);
}

/** Immutable, nested evidence pack of an executed batch (MongoDB document model). */
export async function writeRunSnapshot(corpId: number, batchId: number) {
  const base = (await one<{ base_currency: string }>(`SELECT base_currency FROM corporations WHERE corp_id = $1`, [corpId]))!.base_currency.trim();
  const d = await batchDetail(corpId, batchId);
  if (!d) return;
  const hops = await query(
    `SELECT h.txn_id, h.hop_no, c.corridor_id, sb.name AS from_bank, db.name AS to_bank,
            c.fee_flat, c.fee_currency, c.fee_percent, c.latency_minutes
       FROM sweep_transaction_hops h
       JOIN sweep_transactions t ON t.txn_id = h.txn_id
       JOIN routing_corridors c ON c.corridor_id = h.corridor_id
       JOIN banks sb ON sb.bank_id = c.source_bank_id
       JOIN banks db ON db.bank_id = c.destination_bank_id
      WHERE t.batch_id = $1 ORDER BY h.txn_id, h.hop_no`, [batchId]);
  const toBase = async (ccy: string, amt: string) =>
    Number((await one<{ v: string }>(`SELECT round($2::numeric * get_fx_rate($1, $3), 2) AS v`, [ccy, amt, base]))!.v);
  const transfers = [];
  let volume = 0, fees = 0, completed = 0, failed = 0;
  for (const t of d.transfers as any[]) {
    const amountBase = await toBase(t.source_currency, t.amount_source);
    const feeBase = await toBase(t.source_currency, t.fee_amount);
    if (t.status === 'COMPLETED') { completed++; volume += amountBase; fees += feeBase; } else failed++;
    transfers.push({
      txnId: Number(t.txn_id), type: t.transfer_type, status: t.status, failureReason: t.failure_reason ?? undefined,
      from: { accountId: t.source_account_id, label: t.source_account, bank: t.source_bank, currency: t.source_currency },
      to:   { accountId: t.destination_account_id, label: t.destination_account, bank: t.destination_bank, currency: t.destination_currency },
      amountSource: Number(t.amount_source), fee: Number(t.fee_amount), fxRate: Number(t.fx_rate),
      amountDestination: Number(t.amount_destination), amountBase, feeBase,
      route: (hops as any[]).filter((h) => Number(h.txn_id) === Number(t.txn_id)).map((h) => ({
        hop: h.hop_no, corridorId: h.corridor_id, fromBank: h.from_bank, toBank: h.to_bank,
        feeFlat: Number(h.fee_flat), feeCurrency: h.fee_currency.trim(), feePercent: Number(h.fee_percent),
        latencyMinutes: h.latency_minutes
      }))
    });
  }
  const rates = (await query(`SELECT base_currency, quote_currency, rate, effective_at FROM v_latest_rates`)).map((r: any) => ({
    pair: `${r.base_currency.trim()}/${r.quote_currency.trim()}`, rate: Number(r.rate), effectiveAt: r.effective_at
  }));
  const c = await coll('sweep_run_snapshots');
  await c.replaceOne({ batchId }, {
    batchId, corpId, ts: new Date((d.batch as any).created_at), baseCurrency: base,
    initiatedBy: (d.batch as any).initiated_by, note: (d.batch as any).note ?? undefined,
    summary: { completed, failed, volumeBase: Math.round(volume * 100) / 100, feesBase: Math.round(fees * 100) / 100 },
    transfers, rates
  }, { upsert: true });
}
