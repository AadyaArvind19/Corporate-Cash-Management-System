-- =============================================================================
-- reset.sql : DROP everything created by init/*.sql (reverse dependency order)
-- usage: psql -d ccms -f maintenance/reset.sql   (then re-run init/*.sql)
-- =============================================================================
DROP VIEW     IF EXISTS v_sweep_ledger, v_corporate_liquidity, v_account_positions, v_latest_rates;

DROP FUNCTION IF EXISTS search_accounts(INT, TEXT);
DROP FUNCTION IF EXISTS post_balance_update(INT, NUMERIC, INT, TEXT);
DROP FUNCTION IF EXISTS execute_sweep_batch(INT, INT, INT[], TEXT);
DROP FUNCTION IF EXISTS execute_transfer(INT, transfer_type, INT, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INT[], INT, TEXT);
DROP FUNCTION IF EXISTS plan_cash_position(INT);
DROP FUNCTION IF EXISTS find_best_route(INT, INT, NUMERIC, CHAR);
DROP FUNCTION IF EXISTS find_routes(INT, INT, NUMERIC, CHAR, INT);
DROP FUNCTION IF EXISTS get_fx_rate(CHAR, CHAR, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS fx_pair(CHAR, CHAR, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS fx_direct(CHAR, CHAR, TIMESTAMPTZ);

DROP TABLE IF EXISTS balance_history, sweep_transaction_hops, sweep_transactions, sweep_batches,
                     routing_corridors, exchange_rates, bank_accounts, users, subsidiaries,
                     corporations, banks, currencies CASCADE;

DROP FUNCTION IF EXISTS trg_cascade_search_refresh(), trg_refresh_account_search(), trg_protect_account_identity(),
                        trg_block_mutation(), trg_validate_transfer(), trg_log_opening_balance(), trg_log_balance_change(), trg_set_updated_at();

DROP TYPE IF EXISTS batch_status, transfer_status, transfer_type, corridor_status, account_status, account_type, user_role;
