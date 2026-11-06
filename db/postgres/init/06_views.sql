-- =============================================================================
-- 06_views.sql : reporting views
-- =============================================================================

-- Most recent quote per ordered currency pair
CREATE OR REPLACE VIEW v_latest_rates AS
SELECT DISTINCT ON (e.base_currency, e.quote_currency)
       e.rate_id, e.base_currency, e.quote_currency, e.rate, e.effective_at, e.source
FROM exchange_rates e
WHERE e.effective_at <= now()
ORDER BY e.base_currency, e.quote_currency, e.effective_at DESC;

-- Every account with its reserve position and base-currency equivalents
CREATE OR REPLACE VIEW v_account_positions AS
SELECT a.account_id, a.corp_id, a.subsidiary_id, s.name AS subsidiary, s.country AS subsidiary_country,
       b.bank_id, b.name AS bank, a.nickname, a.account_number, a.account_type, a.currency, a.status,
       a.balance, a.min_reserve, a.min_sweep_amount,
       a.balance - a.min_reserve AS surplus,
       CASE WHEN a.status = 'CLOSED'                                    THEN 'CLOSED'
            WHEN a.status = 'FROZEN'                                    THEN 'FROZEN'
            WHEN a.balance < a.min_reserve                              THEN 'DEFICIT'
            WHEN a.account_type = 'TREASURY'                            THEN 'TREASURY'
            WHEN a.balance - a.min_reserve >= a.min_sweep_amount
                 AND a.balance - a.min_reserve > 0                      THEN 'SURPLUS'
            ELSE 'WITHIN_BAND' END AS cash_position,
       c.base_currency,
       round(a.balance * get_fx_rate(a.currency, c.base_currency), 2)                 AS balance_base,
       round((a.balance - a.min_reserve) * get_fx_rate(a.currency, c.base_currency), 2) AS surplus_base,
       round(a.min_reserve * get_fx_rate(a.currency, c.base_currency), 2)             AS reserve_base,
       a.last_reconciled_at, a.updated_at
FROM bank_accounts a
JOIN subsidiaries  s ON s.subsidiary_id = a.subsidiary_id
JOIN banks         b ON b.bank_id       = a.bank_id
JOIN corporations  c ON c.corp_id       = a.corp_id;

-- One-row liquidity summary per corporation, in its base currency
CREATE OR REPLACE VIEW v_corporate_liquidity AS
SELECT c.corp_id, c.legal_name, c.base_currency,
       coalesce(sum(p.balance_base), 0)                                                     AS total_cash_base,
       coalesce(sum(p.balance_base) FILTER (WHERE p.account_type = 'TREASURY'), 0)          AS treasury_cash_base,
       coalesce(sum(p.balance_base) FILTER (WHERE p.account_type = 'OPERATING'), 0)         AS operating_cash_base,
       coalesce(sum(p.surplus_base) FILTER (WHERE p.cash_position = 'SURPLUS'), 0)           AS idle_surplus_base,
       coalesce(sum(-p.surplus_base) FILTER (WHERE p.cash_position = 'DEFICIT'), 0)         AS reserve_shortfall_base,
       count(p.account_id)                                                                  AS account_count,
       count(*) FILTER (WHERE p.cash_position = 'DEFICIT')                                  AS accounts_in_deficit
FROM corporations c
LEFT JOIN v_account_positions p ON p.corp_id = c.corp_id AND p.status <> 'CLOSED'
GROUP BY c.corp_id, c.legal_name, c.base_currency;

-- Readable transfer ledger
CREATE OR REPLACE VIEW v_sweep_ledger AS
SELECT t.txn_id, t.batch_id, bt.corp_id, t.transfer_type, t.status, t.failure_reason, t.memo,
       t.source_account_id, sa.nickname AS source_account, sb.name AS source_bank,
       t.destination_account_id, da.nickname AS destination_account, db.name AS destination_bank,
       t.source_currency, t.destination_currency, t.amount_source, t.fee_amount, t.fx_rate,
       t.amount_destination, t.latency_minutes, t.executed_at,
       u.username AS initiated_by,
       (SELECT count(*) FROM sweep_transaction_hops h WHERE h.txn_id = t.txn_id) AS hops
FROM sweep_transactions t
JOIN sweep_batches bt ON bt.batch_id = t.batch_id
JOIN users         u  ON u.user_id   = bt.initiated_by
JOIN bank_accounts sa ON sa.account_id = t.source_account_id
JOIN banks         sb ON sb.bank_id    = sa.bank_id
JOIN bank_accounts da ON da.account_id = t.destination_account_id
JOIN banks         db ON db.bank_id    = da.bank_id;
