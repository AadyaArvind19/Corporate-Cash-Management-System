-- =============================================================================
-- important_queries.sql : DML and analytical queries used by the application
-- Run with:  psql -d ccms -f queries/important_queries.sql
-- =============================================================================

-- Q1  JOIN + ORDER BY : account positions for one corporation ---------------------
SELECT p.subsidiary, p.bank, p.nickname, p.currency, p.balance, p.min_reserve, p.surplus, p.cash_position
FROM v_account_positions p
WHERE p.corp_id = 1
ORDER BY p.subsidiary, p.account_type DESC, p.nickname;

-- Q2  GROUP BY + aggregates : cash and surplus by subsidiary (base currency) ------
SELECT s.name AS subsidiary,
       count(*)                                   AS accounts,
       sum(p.balance_base)                        AS cash_base,
       sum(greatest(p.surplus_base, 0))           AS surplus_base
FROM v_account_positions p
JOIN subsidiaries s ON s.subsidiary_id = p.subsidiary_id
WHERE p.corp_id = 1 AND p.status <> 'CLOSED'
GROUP BY s.name
ORDER BY cash_base DESC;

-- Q3  GROUP BY + HAVING : corridors that charged more than 100 (base units) in fees
SELECT c.corridor_id, sb.name AS from_bank, db.name AS to_bank,
       count(DISTINCT h.txn_id)  AS transfers,
       sum(t.fee_amount * get_fx_rate(t.source_currency, 'USD', t.executed_at)) AS fees_usd
FROM sweep_transaction_hops h
JOIN routing_corridors c ON c.corridor_id = h.corridor_id
JOIN banks sb ON sb.bank_id = c.source_bank_id
JOIN banks db ON db.bank_id = c.destination_bank_id
JOIN sweep_transactions t ON t.txn_id = h.txn_id AND t.status = 'COMPLETED'
GROUP BY c.corridor_id, sb.name, db.name
HAVING sum(t.fee_amount * get_fx_rate(t.source_currency, 'USD', t.executed_at)) > 100
ORDER BY fees_usd DESC;

-- Q4  Subquery : operating accounts holding more than the average balance (same currency)
SELECT a.account_id, a.nickname, a.currency, a.balance
FROM bank_accounts a
WHERE a.corp_id = 1 AND a.account_type = 'OPERATING'
  AND a.balance > (SELECT avg(x.balance) FROM bank_accounts x
                   WHERE x.corp_id = a.corp_id AND x.currency = a.currency
                     AND x.account_type = 'OPERATING')
ORDER BY a.currency, a.balance DESC;

-- Q5  Correlated subquery + NOT EXISTS : accounts that never took part in a transfer
SELECT a.account_id, a.nickname
FROM bank_accounts a
WHERE a.corp_id = 1
  AND NOT EXISTS (SELECT 1 FROM sweep_transactions t
                  WHERE t.source_account_id = a.account_id OR t.destination_account_id = a.account_id);

-- Q6  Window function : running total of swept USD equivalent by week ---------------
SELECT w.week, w.swept_to_treasury,
       sum(w.swept_to_treasury) OVER (ORDER BY w.week) AS cumulative
FROM (
    SELECT date_trunc('week', t.executed_at)::DATE AS week,
           sum(t.amount_destination) AS swept_to_treasury
    FROM sweep_transactions t
    JOIN sweep_batches b ON b.batch_id = t.batch_id
    WHERE b.corp_id = 1 AND t.status = 'COMPLETED'
      AND t.transfer_type = 'SWEEP' AND t.destination_currency = 'USD'
    GROUP BY 1
) w
ORDER BY w.week;

-- Q7  Recursive CTE : cheapest route from HDFC Bank (8) to JPMorgan (1) for INR 17.5m
SELECT * FROM find_routes(8, 1, 17500000, 'INR');

-- Q8  Stored function : the live sweep / funding plan ------------------------------
SELECT account_label, action, amount_source, fee_amount, amount_destination, hops, reason
FROM plan_cash_position(1)
ORDER BY account_id;

-- Q9  Full-text search (accounts and transfer memos) ------------------------------
SELECT a.nickname, s.rank FROM search_accounts(1, 'sing op') s JOIN bank_accounts a USING (account_id);
SELECT txn_id, memo FROM sweep_transactions WHERE memo_tsv @@ websearch_to_tsquery('english', 'payroll cover');

-- Q10 DML examples (executed inside a rolled-back transaction here) -----------------
BEGIN;
INSERT INTO exchange_rates (base_currency, quote_currency, rate, source) VALUES ('USD','EUR', 0.9251, 'MANUAL');
UPDATE routing_corridors SET status = 'ACTIVE' WHERE source_bank_id = 5 AND destination_bank_id = 1;
UPDATE bank_accounts SET min_reserve = 550000 WHERE account_id = 2;
DELETE FROM bank_accounts a WHERE a.account_id = 13
  AND NOT EXISTS (SELECT 1 FROM sweep_transactions t WHERE t.source_account_id = 13 OR t.destination_account_id = 13);
ROLLBACK;

-- Q11 Index usage evidence ------------------------------------------------------------
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT * FROM sweep_transactions WHERE status = 'FAILED' ORDER BY executed_at DESC LIMIT 5;

EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT account_id FROM bank_accounts WHERE search_tsv @@ to_tsquery('simple', 'singapore:*');
