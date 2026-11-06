-- =============================================================================
-- Corporate Cash Management System  |  PostgreSQL 16
-- 01_schema.sql : base DDL (tables, keys, constraints)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- bcrypt hashing for seed users

-- ----- Enumerated types ------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('ADMIN', 'TREASURER', 'ANALYST');
CREATE TYPE account_type     AS ENUM ('OPERATING', 'TREASURY');
CREATE TYPE account_status   AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');
CREATE TYPE corridor_status  AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE transfer_type    AS ENUM ('SWEEP', 'FUND');          -- SWEEP: operating -> treasury, FUND: treasury -> operating
CREATE TYPE transfer_status  AS ENUM ('COMPLETED', 'FAILED');
CREATE TYPE batch_status     AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED');

-- ----- Reference data --------------------------------------------------------
CREATE TABLE currencies (
    code        CHAR(3)      PRIMARY KEY,
    name        VARCHAR(60)  NOT NULL,
    CONSTRAINT ck_currency_code CHECK (code ~ '^[A-Z]{3}$')
);

CREATE TABLE banks (
    bank_id     SERIAL       PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    swift_bic   VARCHAR(11)  NOT NULL UNIQUE,
    country     CHAR(2)      NOT NULL,
    CONSTRAINT ck_bank_bic     CHECK (swift_bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
    CONSTRAINT ck_bank_country CHECK (country ~ '^[A-Z]{2}$')
);

-- ----- Organisation ----------------------------------------------------------
CREATE TABLE corporations (
    corp_id          SERIAL       PRIMARY KEY,
    legal_name       VARCHAR(150) NOT NULL UNIQUE,
    hq_country       CHAR(2)      NOT NULL,
    base_currency    CHAR(3)      NOT NULL REFERENCES currencies(code),
    tax_id           VARCHAR(40)  NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_corp_country CHECK (hq_country ~ '^[A-Z]{2}$')
);

CREATE TABLE subsidiaries (
    subsidiary_id    SERIAL       PRIMARY KEY,
    corp_id          INT          NOT NULL REFERENCES corporations(corp_id) ON DELETE RESTRICT,
    name             VARCHAR(150) NOT NULL,
    country          CHAR(2)      NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_subsidiary_name      UNIQUE (corp_id, name),
    CONSTRAINT uq_subsidiary_with_corp UNIQUE (subsidiary_id, corp_id),   -- target for composite FK
    CONSTRAINT ck_sub_country          CHECK (country ~ '^[A-Z]{2}$')
);

CREATE TABLE users (
    user_id          SERIAL       PRIMARY KEY,
    corp_id          INT          NOT NULL REFERENCES corporations(corp_id) ON DELETE RESTRICT,
    username         VARCHAR(40)  NOT NULL,
    full_name        VARCHAR(120) NOT NULL,
    email            VARCHAR(160) NOT NULL,
    password_hash    TEXT         NOT NULL,
    role             user_role    NOT NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_with_corp UNIQUE (user_id, corp_id),
    CONSTRAINT ck_username_fmt   CHECK (username ~ '^[a-z0-9._-]{3,40}$'),
    CONSTRAINT ck_email_fmt      CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT ck_pwd_is_hash    CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$.{53}$')   -- bcrypt only, never plain text
);

-- ----- Accounts, rates, corridors -------------------------------------------
CREATE TABLE bank_accounts (
    account_id        SERIAL        PRIMARY KEY,
    corp_id           INT           NOT NULL,
    subsidiary_id     INT           NOT NULL,
    bank_id           INT           NOT NULL REFERENCES banks(bank_id)      ON DELETE RESTRICT,
    currency          CHAR(3)       NOT NULL REFERENCES currencies(code)    ON DELETE RESTRICT,
    nickname          VARCHAR(80)   NOT NULL,
    account_number    VARCHAR(34)   NOT NULL,
    account_type      account_type  NOT NULL DEFAULT 'OPERATING',
    balance           NUMERIC(18,2) NOT NULL DEFAULT 0,
    min_reserve       NUMERIC(18,2) NOT NULL DEFAULT 0,
    min_sweep_amount  NUMERIC(18,2) NOT NULL DEFAULT 1000,
    status            account_status NOT NULL DEFAULT 'ACTIVE',
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT fk_account_subsidiary FOREIGN KEY (subsidiary_id, corp_id)
        REFERENCES subsidiaries (subsidiary_id, corp_id) ON DELETE RESTRICT,
    CONSTRAINT uq_account_number     UNIQUE (bank_id, account_number),
    CONSTRAINT uq_account_with_corp  UNIQUE (account_id, corp_id),
    CONSTRAINT ck_balance_nonneg     CHECK (balance >= 0),
    CONSTRAINT ck_reserve_nonneg     CHECK (min_reserve >= 0),
    CONSTRAINT ck_min_sweep_nonneg   CHECK (min_sweep_amount >= 0),
    CONSTRAINT ck_account_number_fmt CHECK (account_number ~ '^[A-Za-z0-9-]{5,34}$')
);

CREATE TABLE exchange_rates (
    rate_id         BIGSERIAL     PRIMARY KEY,
    base_currency   CHAR(3)       NOT NULL REFERENCES currencies(code),
    quote_currency  CHAR(3)       NOT NULL REFERENCES currencies(code),
    rate            NUMERIC(18,8) NOT NULL,                  -- 1 base = rate quote
    effective_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    source          VARCHAR(40)   NOT NULL DEFAULT 'MANUAL',
    CONSTRAINT ck_rate_positive  CHECK (rate > 0),
    CONSTRAINT ck_rate_distinct  CHECK (base_currency <> quote_currency),
    CONSTRAINT uq_rate_point     UNIQUE (base_currency, quote_currency, effective_at)
);

CREATE TABLE routing_corridors (
    corridor_id          SERIAL        PRIMARY KEY,
    source_bank_id       INT           NOT NULL REFERENCES banks(bank_id) ON DELETE RESTRICT,
    destination_bank_id  INT           NOT NULL REFERENCES banks(bank_id) ON DELETE RESTRICT,
    fee_flat             NUMERIC(12,2) NOT NULL DEFAULT 0,
    fee_currency         CHAR(3)       NOT NULL REFERENCES currencies(code),
    fee_percent          NUMERIC(6,4)  NOT NULL DEFAULT 0,   -- percent of amount, 0.1000 = 0.10 %
    latency_minutes      INT           NOT NULL,
    status               corridor_status NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT uq_corridor_pair   UNIQUE (source_bank_id, destination_bank_id),
    CONSTRAINT ck_corridor_banks  CHECK (source_bank_id <> destination_bank_id),
    CONSTRAINT ck_corridor_flat   CHECK (fee_flat >= 0),
    CONSTRAINT ck_corridor_pct    CHECK (fee_percent >= 0 AND fee_percent <= 5),
    CONSTRAINT ck_corridor_lat    CHECK (latency_minutes > 0)
);

-- ----- Sweep processing ------------------------------------------------------
CREATE TABLE sweep_batches (
    batch_id       SERIAL       PRIMARY KEY,
    corp_id        INT          NOT NULL REFERENCES corporations(corp_id) ON DELETE RESTRICT,
    initiated_by   INT          NOT NULL,
    note           VARCHAR(300),
    status         batch_status NOT NULL DEFAULT 'COMPLETED',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT fk_batch_user FOREIGN KEY (initiated_by, corp_id)
        REFERENCES users (user_id, corp_id) ON DELETE RESTRICT
);

CREATE TABLE sweep_transactions (
    txn_id                  BIGSERIAL      PRIMARY KEY,
    batch_id                INT            NOT NULL REFERENCES sweep_batches(batch_id) ON DELETE RESTRICT,
    transfer_type           transfer_type  NOT NULL,
    source_account_id       INT            NOT NULL REFERENCES bank_accounts(account_id) ON DELETE RESTRICT,
    destination_account_id  INT            NOT NULL REFERENCES bank_accounts(account_id) ON DELETE RESTRICT,
    source_currency         CHAR(3)        NOT NULL REFERENCES currencies(code),
    destination_currency    CHAR(3)        NOT NULL REFERENCES currencies(code),
    amount_source           NUMERIC(18,2)  NOT NULL,
    fee_amount              NUMERIC(18,2)  NOT NULL DEFAULT 0,      -- charged in source currency
    fx_rate                 NUMERIC(18,8)  NOT NULL,
    amount_destination      NUMERIC(18,2)  NOT NULL,
    latency_minutes         INT            NOT NULL DEFAULT 0,
    status                  transfer_status NOT NULL DEFAULT 'COMPLETED',
    failure_reason          VARCHAR(300),
    memo                    VARCHAR(300),
    executed_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),
    memo_tsv                TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(memo, ''))) STORED,
    CONSTRAINT ck_txn_accounts_differ CHECK (source_account_id <> destination_account_id),
    CONSTRAINT ck_txn_amount_pos      CHECK (amount_source > 0 AND amount_destination > 0),
    CONSTRAINT ck_txn_fee_nonneg      CHECK (fee_amount >= 0),
    CONSTRAINT ck_txn_rate_pos        CHECK (fx_rate > 0),
    CONSTRAINT ck_txn_latency         CHECK (latency_minutes >= 0)
);

-- One row per corridor used by a (possibly multi-hop) transfer
CREATE TABLE sweep_transaction_hops (
    txn_id       BIGINT NOT NULL REFERENCES sweep_transactions(txn_id) ON DELETE CASCADE,
    hop_no       INT    NOT NULL,
    corridor_id  INT    NOT NULL REFERENCES routing_corridors(corridor_id) ON DELETE RESTRICT,
    PRIMARY KEY (txn_id, hop_no),
    CONSTRAINT ck_hop_no CHECK (hop_no >= 1)
);

-- Trigger-maintained balance audit trail (see 05_triggers.sql)
CREATE TABLE balance_history (
    history_id   BIGSERIAL     PRIMARY KEY,
    account_id   INT           NOT NULL REFERENCES bank_accounts(account_id) ON DELETE CASCADE,
    old_balance  NUMERIC(18,2) NOT NULL,
    new_balance  NUMERIC(18,2) NOT NULL,
    reason       VARCHAR(300),
    changed_by   INT           REFERENCES users(user_id) ON DELETE SET NULL,
    txn_id       BIGINT        REFERENCES sweep_transactions(txn_id) ON DELETE SET NULL,
    changed_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Intentionally narrow first-generation index; replaced in 03_indexes.sql
CREATE INDEX idx_sweep_txn_status ON sweep_transactions (status);
