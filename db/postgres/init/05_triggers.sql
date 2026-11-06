-- =============================================================================
-- 05_triggers.sql : integrity and audit triggers
-- =============================================================================

-- 1. updated_at maintenance -------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER set_updated_at_accounts BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- 2. Balance audit trail ----------------------------------------------------
-- Every balance change is recorded with the actor / reason / transfer taken from
-- transaction-local settings (set_config) populated by the stored functions.
CREATE OR REPLACE FUNCTION trg_log_balance_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO balance_history (account_id, old_balance, new_balance, reason, changed_by, txn_id)
    VALUES (NEW.account_id, OLD.balance, NEW.balance,
            nullif(current_setting('app.change_reason', TRUE), ''),
            nullif(current_setting('app.user_id', TRUE), '')::INT,
            nullif(current_setting('app.txn_id', TRUE), '')::BIGINT);
    RETURN NEW;
END $$;

CREATE TRIGGER log_balance_change AFTER UPDATE OF balance ON bank_accounts
    FOR EACH ROW WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
    EXECUTE FUNCTION trg_log_balance_change();

-- Opening balance entry for every new account
CREATE OR REPLACE FUNCTION trg_log_opening_balance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO balance_history (account_id, old_balance, new_balance, reason, changed_by)
    VALUES (NEW.account_id, 0, NEW.balance, 'Opening balance',
            nullif(current_setting('app.user_id', TRUE), '')::INT);
    RETURN NEW;
END $$;

CREATE TRIGGER log_opening_balance AFTER INSERT ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION trg_log_opening_balance();

-- 3. Transfer validation (database-level business rules) --------------------
CREATE OR REPLACE FUNCTION trg_validate_transfer() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    b_corp INT;
    s bank_accounts%ROWTYPE;
    d bank_accounts%ROWTYPE;
BEGIN
    SELECT corp_id INTO b_corp FROM sweep_batches WHERE batch_id = NEW.batch_id;
    SELECT * INTO s FROM bank_accounts WHERE account_id = NEW.source_account_id;
    SELECT * INTO d FROM bank_accounts WHERE account_id = NEW.destination_account_id;

    IF s.corp_id <> b_corp OR d.corp_id <> b_corp THEN
        RAISE EXCEPTION 'Both accounts must belong to the corporation of the batch';
    END IF;
    IF NEW.source_currency <> s.currency OR NEW.destination_currency <> d.currency THEN
        RAISE EXCEPTION 'Transfer currencies must match the account currencies';
    END IF;
    IF NEW.transfer_type = 'SWEEP' AND NOT (s.account_type = 'OPERATING' AND d.account_type = 'TREASURY') THEN
        RAISE EXCEPTION 'A SWEEP must move funds from an operating account to the treasury account';
    END IF;
    IF NEW.transfer_type = 'FUND' AND NOT (s.account_type = 'TREASURY' AND d.account_type = 'OPERATING') THEN
        RAISE EXCEPTION 'A FUND transfer must move funds from the treasury account to an operating account';
    END IF;
    IF abs(NEW.amount_destination - round(NEW.amount_source * NEW.fx_rate, 2)) > 0.01 THEN
        RAISE EXCEPTION 'Destination amount is inconsistent with the applied exchange rate';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER validate_transfer BEFORE INSERT ON sweep_transactions
    FOR EACH ROW EXECUTE FUNCTION trg_validate_transfer();

-- 4. Immutable ledgers ------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_block_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP USING ERRCODE = '23000';
END $$;

CREATE TRIGGER rates_append_only BEFORE UPDATE OR DELETE ON exchange_rates
    FOR EACH ROW EXECUTE FUNCTION trg_block_mutation();
CREATE TRIGGER transactions_append_only BEFORE UPDATE OR DELETE ON sweep_transactions
    FOR EACH ROW EXECUTE FUNCTION trg_block_mutation();

-- 5. Account identity is frozen once it has transfer history ----------------
CREATE OR REPLACE FUNCTION trg_protect_account_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.currency <> NEW.currency OR OLD.account_type <> NEW.account_type) AND EXISTS (
        SELECT 1 FROM sweep_transactions t
        WHERE t.source_account_id = OLD.account_id OR t.destination_account_id = OLD.account_id) THEN
        RAISE EXCEPTION 'Currency and type of account "%" cannot change after transfers exist', OLD.nickname;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER protect_account_identity BEFORE UPDATE OF currency, account_type ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION trg_protect_account_identity();

-- 6. Full-text document for accounts (nickname, bank, subsidiary, country, currency)
CREATE OR REPLACE FUNCTION trg_refresh_account_search() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    SELECT concat_ws(' ', NEW.nickname, b.name, s.name, s.country, NEW.currency, NEW.account_type::TEXT)
      INTO NEW.search_text
      FROM banks b, subsidiaries s
     WHERE b.bank_id = NEW.bank_id AND s.subsidiary_id = NEW.subsidiary_id;
    NEW.search_tsv := to_tsvector('simple', coalesce(NEW.search_text, ''));
    RETURN NEW;
END $$;

CREATE TRIGGER refresh_account_search
    BEFORE INSERT OR UPDATE OF nickname, bank_id, subsidiary_id, currency, account_type ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION trg_refresh_account_search();

-- Renaming a bank / subsidiary refreshes the search document of its accounts
CREATE OR REPLACE FUNCTION trg_cascade_search_refresh() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'banks' THEN
        UPDATE bank_accounts SET nickname = nickname WHERE bank_id = NEW.bank_id;
    ELSE
        UPDATE bank_accounts SET nickname = nickname WHERE subsidiary_id = NEW.subsidiary_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER bank_rename_search AFTER UPDATE OF name ON banks
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION trg_cascade_search_refresh();
CREATE TRIGGER subsidiary_rename_search AFTER UPDATE OF name, country ON subsidiaries
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.country IS DISTINCT FROM NEW.country)
    EXECUTE FUNCTION trg_cascade_search_refresh();
