-- =============================================================================
-- 07_seed.sql : reference data and a realistic demo dataset
-- Two corporations (tenants) so that data isolation is visible.
-- Demo login password for every seeded user:  Treasury#2026   (stored only as a bcrypt hash)
-- =============================================================================

INSERT INTO currencies (code, name) VALUES
 ('USD','US Dollar'), ('EUR','Euro'), ('GBP','Pound Sterling'), ('JPY','Japanese Yen'),
 ('INR','Indian Rupee'), ('SGD','Singapore Dollar'), ('BRL','Brazilian Real');

INSERT INTO banks (name, swift_bic, country) VALUES
 ('JPMorgan Chase Bank',   'CHASUS33', 'US'),   -- 1
 ('Citibank N.A.',         'CITIUS33', 'US'),   -- 2
 ('HSBC UK Bank',          'MIDLGB22', 'GB'),   -- 3
 ('Deutsche Bank AG',      'DEUTDEFF', 'DE'),   -- 4
 ('MUFG Bank',             'BOTKJPJT', 'JP'),   -- 5
 ('DBS Bank',              'DBSSSGSG', 'SG'),   -- 6
 ('Itaú Unibanco',         'ITAUBRSP', 'BR'),   -- 7
 ('HDFC Bank',             'HDFCINBB', 'IN'),   -- 8
 ('Standard Chartered SG', 'SCBLSGSG', 'SG'),   -- 9
 ('Barclays Bank UK',      'BARCGB22', 'GB'),   -- 10
 ('Lloyds Bank',           'LOYDGB2L', 'GB'),   -- 11
 ('BNP Paribas',           'BNPAFRPP', 'FR');   -- 12

-- ----- Organisations ---------------------------------------------------------
INSERT INTO corporations (legal_name, hq_country, base_currency, tax_id) VALUES
 ('Ardent Global Holdings Inc.', 'US', 'USD', '84-3920174'),
 ('Brightwater Foods Ltd',       'GB', 'GBP', 'GB 318 4402 71');

INSERT INTO subsidiaries (corp_id, name, country) VALUES
 (1, 'Ardent Holdings Inc.',       'US'),   -- 1
 (1, 'Ardent UK Ltd',              'GB'),   -- 2
 (1, 'Ardent Deutschland GmbH',    'DE'),   -- 3
 (1, 'Ardent Japan KK',            'JP'),   -- 4
 (1, 'Ardent India Pvt Ltd',       'IN'),   -- 5
 (1, 'Ardent Singapore Pte Ltd',   'SG'),   -- 6
 (1, 'Ardent Brasil Ltda',         'BR'),   -- 7
 (2, 'Brightwater Foods Ltd',      'GB'),   -- 8
 (2, 'Brightwater Ireland DAC',    'IE'),   -- 9
 (2, 'Brightwater France SAS',     'FR');   -- 10

-- ----- Bank accounts ---------------------------------------------------------
INSERT INTO bank_accounts
 (corp_id, subsidiary_id, bank_id, currency, nickname, account_number, account_type, balance, min_reserve, min_sweep_amount, status, last_reconciled_at)
VALUES
 (1,1, 1,'USD','Group Treasury - USD',       'US-CHAS-0040012201',  'TREASURY', 4250000.00, 1000000.00, 0,          'ACTIVE', now() - interval '2 hours'),  -- 1
 (1,1, 2,'USD','US Operating',               'US-CITI-0077315530',  'OPERATING',1820000.00,  500000.00, 10000.00,   'ACTIVE', now() - interval '3 hours'),  -- 2
 (1,2, 3,'GBP','UK Operating',               'GB82MIDL40051500123456','OPERATING', 940500.00, 300000.00, 10000.00,   'ACTIVE', now() - interval '3 hours'),  -- 3
 (1,2, 3,'GBP','UK Payroll',                 'GB45MIDL40051500987654','OPERATING',  88000.00, 120000.00,  5000.00,   'ACTIVE', now() - interval '3 hours'),  -- 4
 (1,3, 4,'EUR','Germany Operating',          'DE89DEUT37040044055100','OPERATING',1260000.00, 400000.00, 10000.00,   'ACTIVE', now() - interval '3 hours'),  -- 5
 (1,4, 5,'JPY','Japan Operating',            'JP-MUFG-1120045873',  'OPERATING',185000000.00, 60000000.00, 1000000.00,'ACTIVE', now() - interval '4 hours'),  -- 6
 (1,5, 8,'INR','India Operating',            'IN-HDFC-50200041872263','OPERATING',42500000.00, 25000000.00, 500000.00,'ACTIVE', now() - interval '4 hours'),  -- 7
 (1,5, 8,'INR','India Collections',          'IN-HDFC-50200041990817','OPERATING', 6200000.00, 10000000.00, 500000.00,'ACTIVE', now() - interval '4 hours'),  -- 8
 (1,6, 6,'SGD','Singapore Operating',        'SG-DBS-0030914477',   'OPERATING',  760000.00,  250000.00, 15000.00,   'ACTIVE', now() - interval '3 hours'),  -- 9
 (1,7, 7,'BRL','Brazil Operating',           'BR-ITAU-4400187263',  'OPERATING', 5900000.00, 2000000.00, 50000.00,   'ACTIVE', now() - interval '5 hours'),  -- 10
 (1,7, 7,'BRL','Brazil Local Suppliers',     'BR-ITAU-4400187990',  'OPERATING',  450000.00,  600000.00, 50000.00,   'ACTIVE', now() - interval '5 hours'),  -- 11
 (1,3, 4,'EUR','Germany Payroll',            'DE12DEUT37040044066201','OPERATING',  210000.00,  200000.00, 25000.00,  'ACTIVE', now() - interval '3 hours'),  -- 12
 (1,6, 9,'SGD','Singapore Legacy Account',   'SG-SCB-0102233445',   'OPERATING',  120000.00,       0.00, 15000.00,   'FROZEN', now() - interval '30 days'),  -- 13
 (1,4, 5,'JPY','Japan Tax Escrow',           'JP-MUFG-1120046001',  'OPERATING',30000000.00, 30000000.00, 1000000.00,'ACTIVE', now() - interval '4 hours'),  -- 14
 (2,8, 10,'GBP','Group Treasury - GBP',      'GB11BARC20040100112233','TREASURY', 1350000.00,  400000.00, 0,         'ACTIVE', now() - interval '1 hour'),    -- 15
 (2,8, 11,'GBP','UK Operations',             'GB33LOYD30961500445566','OPERATING', 612400.00,  150000.00, 5000.00,   'ACTIVE', now() - interval '2 hours'),   -- 16
 (2,9, 12,'EUR','Ireland Operations',        'FR7630004000031234567890143','OPERATING', 288900.00, 120000.00, 5000.00,'ACTIVE', now() - interval '2 hours'),  -- 17
 (2,10,12,'EUR','France Operations',         'FR7630004000039876543210987','OPERATING',  64200.00,  90000.00, 5000.00,'ACTIVE', now() - interval '2 hours'),  -- 18
 (2,8, 11,'GBP','UK Payroll',                'GB77LOYD30961500778899','OPERATING', 142000.00,  140000.00, 5000.00,   'ACTIVE', now() - interval '2 hours');   -- 19

-- ----- Routing corridors -----------------------------------------------------
INSERT INTO routing_corridors (source_bank_id, destination_bank_id, fee_flat, fee_currency, fee_percent, latency_minutes, status) VALUES
 -- into JPMorgan (Ardent treasury bank)
 (2, 1,   8.00,'USD',0.0100,  45,'ACTIVE'),
 (3, 1,  25.00,'USD',0.0500, 240,'ACTIVE'),
 (4, 1,  30.00,'USD',0.0400, 300,'ACTIVE'),
 (5, 1,  35.00,'USD',0.0600, 360,'SUSPENDED'),     -- direct MUFG corridor currently suspended
 (6, 1,  22.00,'USD',0.0450, 300,'ACTIVE'),
 (7, 1,  60.00,'USD',0.1800, 720,'ACTIVE'),
 (8, 1,  55.00,'USD',0.1500, 720,'ACTIVE'),
 (9, 1,  28.00,'USD',0.0500, 300,'ACTIVE'),
 -- regional feeders (cheaper two-hop alternatives)
 (8, 6,  12.00,'USD',0.0400, 180,'ACTIVE'),
 (7, 2,  40.00,'USD',0.1000, 480,'ACTIVE'),
 (5, 6,3000.00,'JPY',0.0300, 180,'ACTIVE'),
 (9, 6,   8.00,'SGD',0.0100,  60,'ACTIVE'),
 -- out of JPMorgan (funding)
 (1, 2,   8.00,'USD',0.0100,  45,'ACTIVE'),
 (1, 3,  25.00,'USD',0.0500, 240,'ACTIVE'),
 (1, 4,  30.00,'USD',0.0400, 300,'ACTIVE'),
 (1, 5,  35.00,'USD',0.0600, 360,'ACTIVE'),
 (1, 6,  22.00,'USD',0.0450, 300,'ACTIVE'),
 (1, 7,  60.00,'USD',0.1800, 720,'ACTIVE'),
 (1, 8,  55.00,'USD',0.1500, 720,'ACTIVE'),
 (1, 9,  28.00,'USD',0.0500, 300,'ACTIVE'),
 (6, 8,  12.00,'USD',0.0400, 180,'ACTIVE'),
 (2, 7,  40.00,'USD',0.1000, 480,'ACTIVE'),
 -- Brightwater network
 (11,10,  6.00,'GBP',0.0100,  30,'ACTIVE'),
 (12,10, 15.00,'EUR',0.0300, 240,'ACTIVE'),
 (10,11,  6.00,'GBP',0.0100,  30,'ACTIVE'),
 (10,12, 15.00,'EUR',0.0300, 240,'ACTIVE'),
 (12,11, 12.00,'EUR',0.0250, 240,'ACTIVE');

-- ----- Exchange rates: 120 days of daily history; day 0 is the current quote -
INSERT INTO exchange_rates (base_currency, quote_currency, rate, effective_at, source)
SELECT p.b, p.q, round(p.r * (1 + 0.012 * sin((d / 6.0 + p.o)::FLOAT8)::NUMERIC) / (1 + 0.012 * sin(p.o::FLOAT8)::NUMERIC), 8),
       now() - make_interval(days => d) - interval '5 minutes', 'ECB reference'
FROM (VALUES ('USD','EUR',0.9240::NUMERIC,0.0), ('USD','GBP',0.7910,0.7), ('USD','JPY',151.2000,1.3),
             ('USD','INR',83.4000,2.1),       ('USD','SGD',1.3450,2.9),  ('USD','BRL',5.0500,3.6),
             ('EUR','GBP',0.8560,4.2)) AS p(b, q, r, o)
CROSS JOIN generate_series(0, 120) AS d;

-- ----- Users (bcrypt hashes, never plain text) -------------------------------
INSERT INTO users (corp_id, username, full_name, email, password_hash, role) VALUES
 (1, 'admin.ardent',       'Priya Nair',   'priya.nair@ardent-global.example',        crypt('Treasury#2026', gen_salt('bf', 10)), 'ADMIN'),
 (1, 'treasurer.ardent',   'Marcus Webb',  'marcus.webb@ardent-global.example',       crypt('Treasury#2026', gen_salt('bf', 10)), 'TREASURER'),
 (1, 'analyst.ardent',     'Elena Rossi',  'elena.rossi@ardent-global.example',       crypt('Treasury#2026', gen_salt('bf', 10)), 'ANALYST'),
 (2, 'admin.brightwater',  'Helen Carter', 'helen.carter@brightwater-foods.example',  crypt('Treasury#2026', gen_salt('bf', 10)), 'ADMIN'),
 (2, 'treasurer.brightwater','Oliver Grant','oliver.grant@brightwater-foods.example', crypt('Treasury#2026', gen_salt('bf', 10)), 'TREASURER');

-- ----- Historical sweeps (12 weeks) -----------------------------------------
-- Inserted directly with back-dated timestamps; rates and routes are resolved with the same
-- functions the live planner uses.
DO $$
DECLARE
    w INT; a INT; n INT;
    v_user INT; v_batch INT; v_txn BIGINT;
    v_at TIMESTAMPTZ; acc RECORD; rt RECORD;
    v_amt NUMERIC; v_fee NUMERIC; v_fx NUMERIC; v_scale NUMERIC; v_fail BOOLEAN; v_status batch_status;
    v_memo TEXT;
BEGIN
    SELECT user_id INTO v_user FROM users WHERE username = 'treasurer.ardent';
    FOR w IN 1..12 LOOP
        v_at := date_trunc('day', now()) - make_interval(days => w * 7) + interval '08:30';
        v_fail := (w IN (3, 8));
        v_memo := CASE WHEN w % 4 = 0 THEN 'Quarter-end cash concentration' ELSE 'Weekly liquidity sweep' END;
        INSERT INTO sweep_batches (corp_id, initiated_by, note, status, created_at)
        VALUES (1, v_user, v_memo, CASE WHEN v_fail THEN 'PARTIAL'::batch_status ELSE 'COMPLETED'::batch_status END, v_at)
        RETURNING batch_id INTO v_batch;

        FOR acc IN SELECT account_id, bank_id, currency FROM bank_accounts
                   WHERE account_id IN (2,3,5,6,7,9,10) ORDER BY account_id LOOP
            n := (w * 7 + acc.account_id * 3) % 9;
            v_scale := get_fx_rate('USD', acc.currency, v_at);
            v_amt := round((15000 + n * 6000) * v_scale, -2);
            SELECT * INTO rt FROM find_best_route(acc.bank_id, 1, v_amt, acc.currency);
            v_fee := ceil((rt.total_flat + v_amt * rt.total_percent / 100) * 100) / 100;
            v_fx  := get_fx_rate(acc.currency, 'USD', v_at);
            INSERT INTO sweep_transactions
              (batch_id, transfer_type, source_account_id, destination_account_id, source_currency, destination_currency,
               amount_source, fee_amount, fx_rate, amount_destination, latency_minutes, status, memo, executed_at)
            VALUES (v_batch, 'SWEEP', acc.account_id, 1, acc.currency, 'USD',
               v_amt, v_fee, v_fx, round(v_amt * v_fx, 2), rt.latency_minutes, 'COMPLETED', v_memo, v_at + make_interval(mins => acc.account_id))
            RETURNING txn_id INTO v_txn;
            INSERT INTO sweep_transaction_hops SELECT v_txn, ord::INT, cid FROM unnest(rt.corridor_path) WITH ORDINALITY u(cid, ord);
        END LOOP;

        -- Reserve top-ups from treasury every third week
        IF w % 3 = 0 THEN
            FOR acc IN SELECT account_id, bank_id, currency FROM bank_accounts WHERE account_id IN (4, 8, 11) ORDER BY account_id LOOP
                v_fx  := get_fx_rate('USD', acc.currency, v_at);
                v_amt := round(4000 + (w * 250), -2);
                SELECT * INTO rt FROM find_best_route(1, acc.bank_id, v_amt, 'USD');
                v_fee := ceil((rt.total_flat + v_amt * rt.total_percent / 100) * 100) / 100;
                INSERT INTO sweep_transactions
                  (batch_id, transfer_type, source_account_id, destination_account_id, source_currency, destination_currency,
                   amount_source, fee_amount, fx_rate, amount_destination, latency_minutes, status, memo, executed_at)
                VALUES (v_batch, 'FUND', 1, acc.account_id, 'USD', acc.currency,
                   v_amt, v_fee, v_fx, round(v_amt * v_fx, 2), rt.latency_minutes, 'COMPLETED',
                   CASE acc.account_id WHEN 4 THEN 'Payroll cover for UK Payroll' WHEN 8 THEN 'Collections account reserve top-up'
                                       ELSE 'Supplier payment cover for Brazil' END, v_at + make_interval(mins => 40 + acc.account_id))
                RETURNING txn_id INTO v_txn;
                INSERT INTO sweep_transaction_hops SELECT v_txn, ord::INT, cid FROM unnest(rt.corridor_path) WITH ORDINALITY u(cid, ord);
            END LOOP;
        END IF;

        -- Two failed transfers in the history (reserve guard fired)
        IF v_fail THEN
            INSERT INTO sweep_transactions
              (batch_id, transfer_type, source_account_id, destination_account_id, source_currency, destination_currency,
               amount_source, fee_amount, fx_rate, amount_destination, latency_minutes, status, failure_reason, memo, executed_at)
            VALUES (v_batch, 'SWEEP', 11, 1, 'BRL', 'USD', 900000.00, 1620.00,
                    get_fx_rate('BRL','USD', v_at), round(900000.00 * get_fx_rate('BRL','USD', v_at), 2), 720, 'FAILED',
                    'Transfer would breach the minimum reserve of account "Brazil Local Suppliers"', v_memo, v_at + interval '20 minutes');
        END IF;
    END LOOP;

    -- Brightwater: six weekly sweeps
    SELECT user_id INTO v_user FROM users WHERE username = 'treasurer.brightwater';
    FOR w IN 1..6 LOOP
        v_at := date_trunc('day', now()) - make_interval(days => w * 7) + interval '09:15';
        INSERT INTO sweep_batches (corp_id, initiated_by, note, status, created_at)
        VALUES (2, v_user, 'Weekly liquidity sweep', 'COMPLETED', v_at) RETURNING batch_id INTO v_batch;
        FOR acc IN SELECT account_id, bank_id, currency FROM bank_accounts WHERE account_id IN (16, 17) ORDER BY account_id LOOP
            v_amt := round(20000 + ((w * 5 + acc.account_id) % 6) * 7500, -2);
            SELECT * INTO rt FROM find_best_route(acc.bank_id, 10, v_amt, acc.currency);
            v_fee := ceil((rt.total_flat + v_amt * rt.total_percent / 100) * 100) / 100;
            v_fx  := get_fx_rate(acc.currency, 'GBP', v_at);
            INSERT INTO sweep_transactions
              (batch_id, transfer_type, source_account_id, destination_account_id, source_currency, destination_currency,
               amount_source, fee_amount, fx_rate, amount_destination, latency_minutes, status, memo, executed_at)
            VALUES (v_batch, 'SWEEP', acc.account_id, 15, acc.currency, 'GBP',
               v_amt, v_fee, v_fx, round(v_amt * v_fx, 2), rt.latency_minutes, 'COMPLETED', 'Weekly liquidity sweep', v_at + make_interval(mins => acc.account_id))
            RETURNING txn_id INTO v_txn;
            INSERT INTO sweep_transaction_hops SELECT v_txn, ord::INT, cid FROM unnest(rt.corridor_path) WITH ORDINALITY u(cid, ord);
        END LOOP;
    END LOOP;
END $$;

ANALYZE;
