-- =============================================================================
-- 04_functions.sql : stored functions and procedures (business logic in the DB)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Exchange rates
-- ---------------------------------------------------------------------------
-- Most recent stored rate for an ordered pair at a point in time (NULL if none)
CREATE OR REPLACE FUNCTION fx_direct(p_base CHAR(3), p_quote CHAR(3), p_at TIMESTAMPTZ)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
    SELECT e.rate
    FROM exchange_rates e
    WHERE e.base_currency = p_base AND e.quote_currency = p_quote AND e.effective_at <= p_at
    ORDER BY e.effective_at DESC
    LIMIT 1
$$;

-- Direct rate, or its inverse (NULL if neither exists)
CREATE OR REPLACE FUNCTION fx_pair(p_from CHAR(3), p_to CHAR(3), p_at TIMESTAMPTZ)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE r NUMERIC;
BEGIN
    IF p_from = p_to THEN RETURN 1; END IF;
    r := fx_direct(p_from, p_to, p_at);
    IF r IS NOT NULL THEN RETURN r; END IF;
    r := fx_direct(p_to, p_from, p_at);
    IF r IS NOT NULL THEN RETURN 1 / r; END IF;
    RETURN NULL;
END $$;

-- Conversion rate with USD triangulation when no direct quote exists
CREATE OR REPLACE FUNCTION get_fx_rate(p_from CHAR(3), p_to CHAR(3), p_at TIMESTAMPTZ DEFAULT now())
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE r NUMERIC; leg1 NUMERIC; leg2 NUMERIC;
BEGIN
    r := fx_pair(p_from, p_to, p_at);
    IF r IS NULL THEN
        leg1 := fx_pair(p_from, 'USD', p_at);
        leg2 := fx_pair('USD', p_to, p_at);
        IF leg1 IS NOT NULL AND leg2 IS NOT NULL THEN r := leg1 * leg2; END IF;
    END IF;
    IF r IS NULL THEN
        RAISE EXCEPTION 'No exchange rate available for % -> %', p_from, p_to USING ERRCODE = 'P0002';
    END IF;
    RETURN round(r, 8);
END $$;

-- ---------------------------------------------------------------------------
-- Routing: cheapest corridor path between two banks (recursive CTE, <= p_max_hops)
-- Fees are expressed in the source account currency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_routes(
    p_src_bank INT, p_dst_bank INT, p_amount NUMERIC, p_currency CHAR(3), p_max_hops INT DEFAULT 3)
RETURNS TABLE (corridor_path INT[], bank_path INT[], hops INT,
               total_flat NUMERIC, total_percent NUMERIC, total_fee NUMERIC, latency_minutes INT)
LANGUAGE sql STABLE AS $$
    WITH RECURSIVE walk AS (
        SELECT ARRAY[c.corridor_id]                           AS cpath,
               ARRAY[c.source_bank_id, c.destination_bank_id] AS bpath,
               1                                              AS h,
               c.destination_bank_id                          AS tail,
               (c.fee_flat * get_fx_rate(c.fee_currency, p_currency))::NUMERIC AS flat,
               c.fee_percent::NUMERIC                         AS pct,
               c.latency_minutes                              AS lat
        FROM routing_corridors c
        WHERE c.source_bank_id = p_src_bank AND c.status = 'ACTIVE'
      UNION ALL
        SELECT w.cpath || c.corridor_id,
               w.bpath || c.destination_bank_id,
               w.h + 1,
               c.destination_bank_id,
               w.flat + c.fee_flat * get_fx_rate(c.fee_currency, p_currency),
               w.pct + c.fee_percent,
               w.lat + c.latency_minutes
        FROM walk w
        JOIN routing_corridors c ON c.source_bank_id = w.tail AND c.status = 'ACTIVE'
        WHERE w.h < p_max_hops
          AND w.tail <> p_dst_bank
          AND NOT (c.destination_bank_id = ANY (w.bpath))
    )
    SELECT x.cpath, x.bpath, x.h, x.flat, x.pct, x.fee, x.lat
    FROM (
        SELECT cpath, bpath, h, round(flat, 2) AS flat, pct,
               round(flat + p_amount * pct / 100, 2) AS fee, lat
        FROM walk WHERE tail = p_dst_bank
        UNION ALL
        SELECT ARRAY[]::INT[], ARRAY[p_src_bank], 0, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0
        WHERE p_src_bank = p_dst_bank                       -- same bank: book transfer, no corridor
    ) x
    ORDER BY x.fee, x.lat, x.h
$$;

CREATE OR REPLACE FUNCTION find_best_route(
    p_src_bank INT, p_dst_bank INT, p_amount NUMERIC, p_currency CHAR(3))
RETURNS TABLE (corridor_path INT[], bank_path INT[], hops INT,
               total_flat NUMERIC, total_percent NUMERIC, total_fee NUMERIC, latency_minutes INT)
LANGUAGE sql STABLE AS $$
    SELECT * FROM find_routes(p_src_bank, p_dst_bank, p_amount, p_currency) LIMIT 1
$$;

-- ---------------------------------------------------------------------------
-- Cash position planning
--   SWEEP : operating account balance above (min_reserve) moves to the treasury account
--   FUND  : operating account below min_reserve is topped up from treasury, never taking
--           the treasury below its own reserve (largest shortfalls first, all-or-nothing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION plan_cash_position(p_corp INT)
RETURNS TABLE (
    account_id INT, account_label TEXT, action TEXT,
    source_account_id INT, destination_account_id INT,
    source_currency CHAR(3), destination_currency CHAR(3),
    amount_source NUMERIC, fee_amount NUMERIC, fx_rate NUMERIC, amount_destination NUMERIC,
    corridor_path INT[], hops INT, latency_minutes INT, reason TEXT)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE
    t        bank_accounts%ROWTYPE;
    a        RECORD;
    rt       RECORD;
    v_avail  NUMERIC;
    v_sur    NUMERIC;
    v_def    NUMERIC;
    v_rate   NUMERIC;
    v_amt    NUMERIC;
    v_fee    NUMERIC;
    v_dest   NUMERIC;
BEGIN
    SELECT * INTO t FROM bank_accounts ba
     WHERE ba.corp_id = p_corp AND ba.account_type = 'TREASURY' AND ba.status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Corporation % has no active treasury account', p_corp;
    END IF;
    v_avail := greatest(t.balance - t.min_reserve, 0);

    ------------------------------------------------------------------ sweeps
    FOR a IN
        SELECT ba.account_id, ba.nickname, ba.bank_id, ba.currency, ba.balance,
               ba.min_reserve, ba.min_sweep_amount, ba.status
        FROM bank_accounts ba
        WHERE ba.corp_id = p_corp AND ba.account_type = 'OPERATING'
        ORDER BY ba.account_id
    LOOP
        IF a.status <> 'ACTIVE' THEN
            RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'NONE', NULL::INT, NULL::INT, NULL::CHAR(3), NULL::CHAR(3),
                NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::INT[], NULL::INT, NULL::INT,
                ('Account is ' || a.status)::TEXT;
            CONTINUE;
        END IF;
        IF a.balance < a.min_reserve THEN CONTINUE; END IF;          -- handled in the funding pass

        v_sur := a.balance - a.min_reserve;
        IF v_sur <= 0 OR v_sur < a.min_sweep_amount THEN
            RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'NONE', NULL::INT, NULL::INT, NULL::CHAR(3), NULL::CHAR(3),
                NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::INT[], NULL::INT, NULL::INT,
                'Surplus below sweep threshold'::TEXT;
            CONTINUE;
        END IF;

        SELECT * INTO rt FROM find_best_route(a.bank_id, t.bank_id, v_sur, a.currency);
        IF NOT FOUND THEN
            RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'NO_ROUTE', NULL::INT, NULL::INT, NULL::CHAR(3), NULL::CHAR(3),
                NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::INT[], NULL::INT, NULL::INT,
                'No active corridor to the treasury bank'::TEXT;
            CONTINUE;
        END IF;

        -- amount + flat + amount*pct/100 <= surplus  (fee is paid from the same account)
        v_amt := floor(((v_sur - rt.total_flat) / (1 + rt.total_percent / 100)) * 100) / 100;
        IF v_amt > 0 THEN
            v_fee := ceil((rt.total_flat + v_amt * rt.total_percent / 100) * 100) / 100;
            WHILE v_amt > 0 AND v_amt + v_fee > v_sur LOOP
                v_amt := v_amt - 0.01;
                v_fee := ceil((rt.total_flat + v_amt * rt.total_percent / 100) * 100) / 100;
            END LOOP;
        END IF;
        v_rate := get_fx_rate(a.currency, t.currency);
        v_amt  := round(v_amt, 2);
        v_fee  := round(v_fee, 2);
        v_dest := round(v_amt * v_rate, 2);
        IF v_amt <= 0 OR v_dest <= 0 THEN
            RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'NONE', NULL::INT, NULL::INT, NULL::CHAR(3), NULL::CHAR(3),
                NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::INT[], NULL::INT, NULL::INT,
                'Transfer cost exceeds the available surplus'::TEXT;
            CONTINUE;
        END IF;

        RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'SWEEP', a.account_id, t.account_id,
            a.currency, t.currency, v_amt, v_fee, v_rate, v_dest,
            rt.corridor_path, rt.hops, rt.latency_minutes, 'Surplus above minimum reserve'::TEXT;
    END LOOP;

    ----------------------------------------------------------------- funding
    FOR a IN
        SELECT ba.account_id, ba.nickname, ba.bank_id, ba.currency, ba.balance, ba.min_reserve
        FROM bank_accounts ba
        WHERE ba.corp_id = p_corp AND ba.account_type = 'OPERATING'
          AND ba.status = 'ACTIVE' AND ba.balance < ba.min_reserve
        ORDER BY (ba.min_reserve - ba.balance) / get_fx_rate(ba.currency, t.currency) DESC, ba.account_id
    LOOP
        v_def  := a.min_reserve - a.balance;
        v_rate := get_fx_rate(t.currency, a.currency);
        v_amt  := ceil(v_def / v_rate * 100) / 100;
        WHILE round(v_amt * v_rate, 2) < v_def LOOP v_amt := v_amt + 0.01; END LOOP;

        SELECT * INTO rt FROM find_best_route(t.bank_id, a.bank_id, v_amt, t.currency);
        IF NOT FOUND THEN
            RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'NO_ROUTE', NULL::INT, NULL::INT, NULL::CHAR(3), NULL::CHAR(3),
                NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::INT[], NULL::INT, NULL::INT,
                'No active corridor from the treasury bank'::TEXT;
            CONTINUE;
        END IF;

        v_fee  := round(ceil((rt.total_flat + v_amt * rt.total_percent / 100) * 100) / 100, 2);
        v_amt  := round(v_amt, 2);
        v_dest := round(v_amt * v_rate, 2);

        IF v_amt + v_fee <= v_avail THEN
            v_avail := v_avail - (v_amt + v_fee);
            RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'FUND', t.account_id, a.account_id,
                t.currency, a.currency, v_amt, v_fee, v_rate, v_dest,
                rt.corridor_path, rt.hops, rt.latency_minutes, 'Restore minimum reserve'::TEXT;
        ELSE
            RETURN QUERY SELECT a.account_id, a.nickname::TEXT, 'INSUFFICIENT_TREASURY', NULL::INT, NULL::INT, NULL::CHAR(3), NULL::CHAR(3),
                NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::INT[], NULL::INT, NULL::INT,
                'Treasury surplus over its own reserve is insufficient'::TEXT;
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Single transfer: row locks in id order (deadlock-free), reserve check, atomic double update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION execute_transfer(
    p_batch INT, p_type transfer_type, p_src INT, p_dst INT,
    p_amount NUMERIC, p_fee NUMERIC, p_fx NUMERIC, p_dest_amount NUMERIC,
    p_path INT[], p_latency INT, p_memo TEXT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    s bank_accounts%ROWTYPE;
    d bank_accounts%ROWTYPE;
    v_txn BIGINT;
BEGIN
    IF p_src < p_dst THEN
        SELECT * INTO s FROM bank_accounts WHERE account_id = p_src FOR UPDATE;
        SELECT * INTO d FROM bank_accounts WHERE account_id = p_dst FOR UPDATE;
    ELSE
        SELECT * INTO d FROM bank_accounts WHERE account_id = p_dst FOR UPDATE;
        SELECT * INTO s FROM bank_accounts WHERE account_id = p_src FOR UPDATE;
    END IF;

    IF s.status <> 'ACTIVE' OR d.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Both accounts must be ACTIVE (% / %)', s.status, d.status;
    END IF;
    IF s.balance - p_amount - p_fee < s.min_reserve THEN
        RAISE EXCEPTION 'Transfer would breach the minimum reserve of account "%"', s.nickname;
    END IF;

    INSERT INTO sweep_transactions
        (batch_id, transfer_type, source_account_id, destination_account_id,
         source_currency, destination_currency, amount_source, fee_amount, fx_rate,
         amount_destination, latency_minutes, status, memo)
    VALUES
        (p_batch, p_type, p_src, p_dst, s.currency, d.currency, p_amount, p_fee, p_fx,
         p_dest_amount, p_latency, 'COMPLETED', p_memo)
    RETURNING txn_id INTO v_txn;

    PERFORM set_config('app.txn_id', v_txn::TEXT, TRUE);
    PERFORM set_config('app.change_reason', p_type::TEXT || ' (batch ' || p_batch || ')', TRUE);
    UPDATE bank_accounts SET balance = balance - p_amount - p_fee WHERE account_id = p_src;
    UPDATE bank_accounts SET balance = balance + p_dest_amount    WHERE account_id = p_dst;
    PERFORM set_config('app.txn_id', '', TRUE);
    PERFORM set_config('app.change_reason', '', TRUE);

    INSERT INTO sweep_transaction_hops (txn_id, hop_no, corridor_id)
    SELECT v_txn, ord::INT, cid FROM unnest(p_path) WITH ORDINALITY AS u(cid, ord);

    RETURN v_txn;
END $$;

-- ---------------------------------------------------------------------------
-- Batch execution: one DB transaction, one savepoint per transfer.
-- The plan is recomputed here under an advisory lock so it always reflects live balances.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION execute_sweep_batch(
    p_corp INT, p_user INT, p_account_ids INT[] DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    u       users%ROWTYPE;
    v_batch INT;
    r       RECORD;
    v_ok    INT := 0;
    v_fail  INT := 0;
BEGIN
    SELECT * INTO u FROM users WHERE user_id = p_user AND corp_id = p_corp AND is_active;
    IF NOT FOUND OR u.role NOT IN ('ADMIN', 'TREASURER') THEN
        RAISE EXCEPTION 'User % is not authorised to execute sweeps for corporation %', p_user, p_corp
            USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(p_corp);                  -- one batch at a time per corporation
    PERFORM set_config('app.user_id', p_user::TEXT, TRUE);

    INSERT INTO sweep_batches (corp_id, initiated_by, note)
    VALUES (p_corp, p_user, p_note) RETURNING batch_id INTO v_batch;

    FOR r IN
        SELECT * FROM plan_cash_position(p_corp) p
        WHERE p.action IN ('SWEEP', 'FUND')
          AND (p_account_ids IS NULL OR p.account_id = ANY (p_account_ids))
        ORDER BY p.action DESC, p.account_id            -- SWEEP before FUND
    LOOP
        BEGIN
            PERFORM execute_transfer(v_batch, r.action::transfer_type, r.source_account_id,
                r.destination_account_id, r.amount_source, r.fee_amount, r.fx_rate,
                r.amount_destination, r.corridor_path, r.latency_minutes,
                coalesce(p_note, CASE r.action WHEN 'SWEEP' THEN 'Surplus sweep to treasury'
                                               ELSE 'Reserve top-up from treasury' END));
            v_ok := v_ok + 1;
        EXCEPTION WHEN OTHERS THEN                       -- sub-transaction rolled back, batch continues
            INSERT INTO sweep_transactions
                (batch_id, transfer_type, source_account_id, destination_account_id,
                 source_currency, destination_currency, amount_source, fee_amount, fx_rate,
                 amount_destination, latency_minutes, status, failure_reason, memo)
            VALUES (v_batch, r.action::transfer_type, r.source_account_id, r.destination_account_id,
                 r.source_currency, r.destination_currency, r.amount_source, r.fee_amount, r.fx_rate,
                 r.amount_destination, r.latency_minutes, 'FAILED', left(SQLERRM, 300), p_note);
            v_fail := v_fail + 1;
        END;
    END LOOP;

    IF v_ok + v_fail = 0 THEN
        RAISE EXCEPTION 'No eligible transfers to execute' USING ERRCODE = 'P0002';
    END IF;

    UPDATE sweep_batches
       SET status = CASE WHEN v_fail = 0 THEN 'COMPLETED'::batch_status
                         WHEN v_ok   = 0 THEN 'FAILED'::batch_status
                         ELSE 'PARTIAL'::batch_status END
     WHERE batch_id = v_batch;
    RETURN v_batch;
END $$;

-- ---------------------------------------------------------------------------
-- Bank statement update: set the reconciled balance of an account with an audit reason
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_balance_update(
    p_account INT, p_new_balance NUMERIC, p_user INT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE u users%ROWTYPE; a bank_accounts%ROWTYPE;
BEGIN
    SELECT * INTO a FROM bank_accounts WHERE account_id = p_account FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account % does not exist', p_account; END IF;
    SELECT * INTO u FROM users WHERE user_id = p_user AND corp_id = a.corp_id AND is_active;
    IF NOT FOUND OR u.role NOT IN ('ADMIN', 'TREASURER') THEN
        RAISE EXCEPTION 'User % is not authorised to update balances', p_user USING ERRCODE = '42501';
    END IF;
    IF a.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Account % is %', a.nickname, a.status; END IF;
    PERFORM set_config('app.user_id', p_user::TEXT, TRUE);
    PERFORM set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Bank statement update'), TRUE);
    UPDATE bank_accounts SET balance = p_new_balance, last_reconciled_at = now() WHERE account_id = p_account;
END $$;

-- ---------------------------------------------------------------------------
-- Full-text account search with prefix matching ("sing op" matches "Singapore Operating")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_accounts(p_corp INT, p_query TEXT)
RETURNS TABLE (account_id INT, rank REAL)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
DECLARE q TEXT;
BEGIN
    SELECT string_agg(tok || ':*', ' & ') INTO q
    FROM regexp_split_to_table(lower(regexp_replace(coalesce(p_query, ''), '[^a-zA-Z0-9 ]', ' ', 'g')), '\s+') AS tok
    WHERE tok <> '';
    IF q IS NULL THEN RETURN; END IF;
    RETURN QUERY
        SELECT ba.account_id, ts_rank(ba.search_tsv, to_tsquery('simple', q))
        FROM bank_accounts ba
        WHERE ba.corp_id = p_corp AND ba.search_tsv @@ to_tsquery('simple', q)
        ORDER BY 2 DESC, ba.account_id;
END $$;
