-- =============================================================================
-- 02_alter_schema.sql : schema evolution (ALTER statements)
-- Applied after the base schema; mirrors a production migration.
-- =============================================================================

-- Reconciliation tracking against the bank statement
ALTER TABLE bank_accounts
    ADD COLUMN last_reconciled_at TIMESTAMPTZ;

-- Full-text search support for accounts (maintained by trigger, see 05_triggers.sql)
ALTER TABLE bank_accounts
    ADD COLUMN search_text TEXT,
    ADD COLUMN search_tsv  TSVECTOR;

-- New users default to the least privileged role
ALTER TABLE users
    ALTER COLUMN role SET DEFAULT 'ANALYST';

-- An account can only be closed once it has been emptied
ALTER TABLE bank_accounts
    ADD CONSTRAINT ck_closed_requires_zero CHECK (status <> 'CLOSED' OR balance = 0);

-- A failed transfer must explain why; a completed one must not carry a failure reason
ALTER TABLE sweep_transactions
    ADD CONSTRAINT ck_failed_has_reason CHECK ((status = 'FAILED') = (failure_reason IS NOT NULL));

-- Widen percentage fee precision for corridors quoted in basis points
ALTER TABLE routing_corridors
    ALTER COLUMN fee_percent TYPE NUMERIC(7,4);
