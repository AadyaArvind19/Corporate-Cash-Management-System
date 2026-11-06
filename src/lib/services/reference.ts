import { query, one } from '../db';

// ----- exchange rates -------------------------------------------------------
export async function latestRates() {
  return query(
    `SELECT r.base_currency, r.quote_currency, r.rate, r.effective_at, r.source,
            fx_direct(r.base_currency, r.quote_currency, now() - interval '7 days') AS rate_7d
       FROM v_latest_rates r ORDER BY r.base_currency, r.quote_currency`);
}

export async function rateHistory(base: string, quote: string, days = 90) {
  return query(
    `SELECT effective_at, rate, source FROM exchange_rates
      WHERE base_currency = $1 AND quote_currency = $2 AND effective_at >= now() - make_interval(days => $3)
      ORDER BY effective_at`, [base, quote, days]);
}

export async function addRate(base: string, quote: string, rate: string) {
  const rows = await query(
    `INSERT INTO exchange_rates (base_currency, quote_currency, rate, source) VALUES ($1,$2,$3,'MANUAL') RETURNING rate_id`,
    [base, quote, rate]);
  return rows[0].rate_id as number;
}

export const currencies = () => query(`SELECT code, name FROM currencies ORDER BY code`);

// ----- banks & subsidiaries ---------------------------------------------------
export const listBanks = () => query(`SELECT bank_id, name, swift_bic, country FROM banks ORDER BY name`);

export async function createBank(b: { name: string; swiftBic: string; country: string }) {
  const r = await query(`INSERT INTO banks (name, swift_bic, country) VALUES ($1,$2,$3) RETURNING bank_id`, [b.name, b.swiftBic, b.country]);
  return r[0].bank_id as number;
}

export const listSubsidiaries = (corpId: number) =>
  query(`SELECT s.subsidiary_id, s.name, s.country,
                (SELECT count(*) FROM bank_accounts a WHERE a.subsidiary_id = s.subsidiary_id) AS accounts
           FROM subsidiaries s WHERE s.corp_id = $1 ORDER BY s.name`, [corpId]);

export async function createSubsidiary(corpId: number, name: string, country: string) {
  const r = await query(`INSERT INTO subsidiaries (corp_id, name, country) VALUES ($1,$2,$3) RETURNING subsidiary_id`, [corpId, name, country]);
  return r[0].subsidiary_id as number;
}

export async function updateSubsidiary(corpId: number, id: number, name: string, country: string) {
  return (await query(`UPDATE subsidiaries SET name = $3, country = $4 WHERE corp_id = $1 AND subsidiary_id = $2 RETURNING subsidiary_id`,
    [corpId, id, name, country])).length > 0;
}

export async function deleteSubsidiary(corpId: number, id: number) {
  return (await query(`DELETE FROM subsidiaries WHERE corp_id = $1 AND subsidiary_id = $2 RETURNING subsidiary_id`, [corpId, id])).length > 0;
}

// ----- corridors ----------------------------------------------------------------
export const listCorridors = () =>
  query(`SELECT c.corridor_id, c.source_bank_id, c.destination_bank_id, sb.name AS source_bank, db.name AS destination_bank,
                c.fee_flat, c.fee_currency, c.fee_percent, c.latency_minutes, c.status,
                (SELECT count(*) FROM sweep_transaction_hops h WHERE h.corridor_id = c.corridor_id) AS uses
           FROM routing_corridors c
           JOIN banks sb ON sb.bank_id = c.source_bank_id
           JOIN banks db ON db.bank_id = c.destination_bank_id
          ORDER BY sb.name, db.name`);

export async function createCorridor(c: { sourceBankId: number; destinationBankId: number; feeFlat: string; feeCurrency: string; feePercent: string; latencyMinutes: number }) {
  const r = await query(
    `INSERT INTO routing_corridors (source_bank_id, destination_bank_id, fee_flat, fee_currency, fee_percent, latency_minutes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING corridor_id`,
    [c.sourceBankId, c.destinationBankId, c.feeFlat, c.feeCurrency, c.feePercent, c.latencyMinutes]);
  return r[0].corridor_id as number;
}

export async function updateCorridor(id: number, p: { feeFlat?: string; feeCurrency?: string; feePercent?: string; latencyMinutes?: number; status?: 'ACTIVE' | 'SUSPENDED' }) {
  const sets: string[] = []; const params: unknown[] = [];
  const add = (col: string, v: unknown, cast = '') => { params.push(v); sets.push(`${col} = $${params.length}${cast}`); };
  if (p.feeFlat !== undefined) add('fee_flat', p.feeFlat);
  if (p.feeCurrency !== undefined) add('fee_currency', p.feeCurrency);
  if (p.feePercent !== undefined) add('fee_percent', p.feePercent);
  if (p.latencyMinutes !== undefined) add('latency_minutes', p.latencyMinutes);
  if (p.status !== undefined) add('status', p.status, '::corridor_status');
  if (!sets.length) return false;
  params.push(id);
  return (await query(`UPDATE routing_corridors SET ${sets.join(', ')} WHERE corridor_id = $${params.length} RETURNING corridor_id`, params)).length > 0;
}

export async function deleteCorridor(id: number) {
  return (await query(`DELETE FROM routing_corridors WHERE corridor_id = $1 RETURNING corridor_id`, [id])).length > 0;
}

export async function findRoutes(fromBank: number, toBank: number, amount: string, currency: string) {
  return query(
    `SELECT r.corridor_path, r.hops, r.total_flat, r.total_percent, r.total_fee, r.latency_minutes,
            (SELECT string_agg(b.name, ' › ' ORDER BY o) FROM unnest(r.bank_path) WITH ORDINALITY u(bid, o)
               JOIN banks b ON b.bank_id = u.bid) AS path_text
       FROM find_routes($1, $2, $3::numeric, $4) r`, [fromBank, toBank, amount, currency]);
}

export const bankOf = (id: number) => one(`SELECT bank_id FROM banks WHERE bank_id = $1`, [id]);
