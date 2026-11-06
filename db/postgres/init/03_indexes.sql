-- =============================================================================
-- 03_indexes.sql : indexing strategy
-- =============================================================================

-- Replace the narrow first-generation index with a composite one that also serves date-ordered history
DROP INDEX IF EXISTS idx_sweep_txn_status;
CREATE INDEX idx_txn_status_date ON sweep_transactions (status, executed_at DESC);

-- Foreign-key / join support
CREATE INDEX idx_txn_batch        ON sweep_transactions (batch_id);
CREATE INDEX idx_txn_source       ON sweep_transactions (source_account_id, executed_at DESC);
CREATE INDEX idx_txn_destination  ON sweep_transactions (destination_account_id, executed_at DESC);
CREATE INDEX idx_hops_corridor    ON sweep_transaction_hops (corridor_id);
CREATE INDEX idx_accounts_bank    ON bank_accounts (bank_id);
CREATE INDEX idx_accounts_sub     ON bank_accounts (subsidiary_id);
CREATE INDEX idx_batches_corp     ON sweep_batches (corp_id, created_at DESC);
CREATE INDEX idx_users_corp       ON users (corp_id);

-- Partial indexes (only the rows the application actually filters on)
CREATE INDEX idx_accounts_active_corp ON bank_accounts (corp_id, subsidiary_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_corridors_active_src ON routing_corridors (source_bank_id)     WHERE status = 'ACTIVE';

-- Business rule enforced by index: exactly one open treasury account per corporation
CREATE UNIQUE INDEX uq_one_treasury_per_corp ON bank_accounts (corp_id)
    WHERE account_type = 'TREASURY' AND status <> 'CLOSED';

-- Case-insensitive uniqueness for login identifiers
CREATE UNIQUE INDEX uq_users_username_ci ON users (lower(username));
CREATE UNIQUE INDEX uq_users_email_ci    ON users (lower(email));

-- Latest-rate lookup: (pair, newest first)
CREATE INDEX idx_rates_lookup ON exchange_rates (base_currency, quote_currency, effective_at DESC);

-- Balance audit trail per account
CREATE INDEX idx_balance_history ON balance_history (account_id, changed_at DESC);

-- Full-text search (GIN)
CREATE INDEX idx_accounts_search ON bank_accounts USING GIN (search_tsv);
CREATE INDEX idx_txn_memo_search ON sweep_transactions USING GIN (memo_tsv);
