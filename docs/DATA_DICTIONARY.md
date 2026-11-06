# Data dictionary (PostgreSQL)

Generated from the live catalogue of the `ccms` database (`information_schema`). Constraint details are in `db/postgres/init/01_schema.sql` and `02_alter_schema.sql`.


## balance_history

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `history_id` | bigint | NOT NULL | `nextval('balance_history_history_id_seq'::regclass)` | PK |
| 2 | `account_id` | integer | NOT NULL |  | FK |
| 3 | `old_balance` | numeric(18,2) | NOT NULL |  |  |
| 4 | `new_balance` | numeric(18,2) | NOT NULL |  |  |
| 5 | `reason` | varchar(300) | NULL |  |  |
| 6 | `changed_by` | integer | NULL |  | FK |
| 7 | `txn_id` | bigint | NULL |  | FK |
| 8 | `changed_at` | timestamp with time zone | NOT NULL | `now()` |  |

## bank_accounts

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `account_id` | integer | NOT NULL | `nextval('bank_accounts_account_id_seq'::regclass)` | PK,UK |
| 2 | `corp_id` | integer | NOT NULL |  | UK,FK |
| 3 | `subsidiary_id` | integer | NOT NULL |  | FK |
| 4 | `bank_id` | integer | NOT NULL |  | UK,FK |
| 5 | `currency` | char(3) | NOT NULL |  | FK |
| 6 | `nickname` | varchar(80) | NOT NULL |  |  |
| 7 | `account_number` | varchar(34) | NOT NULL |  | UK |
| 8 | `account_type` | account_type | NOT NULL | `'OPERATING'::account_type` |  |
| 9 | `balance` | numeric(18,2) | NOT NULL | `0` |  |
| 10 | `min_reserve` | numeric(18,2) | NOT NULL | `0` |  |
| 11 | `min_sweep_amount` | numeric(18,2) | NOT NULL | `1000` |  |
| 12 | `status` | account_status | NOT NULL | `'ACTIVE'::account_status` |  |
| 13 | `created_at` | timestamp with time zone | NOT NULL | `now()` |  |
| 14 | `updated_at` | timestamp with time zone | NOT NULL | `now()` |  |
| 15 | `last_reconciled_at` | timestamp with time zone | NULL |  |  |
| 16 | `search_text` | text | NULL |  |  |
| 17 | `search_tsv` | tsvector | NULL |  |  |

## banks

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `bank_id` | integer | NOT NULL | `nextval('banks_bank_id_seq'::regclass)` | PK |
| 2 | `name` | varchar(120) | NOT NULL |  |  |
| 3 | `swift_bic` | varchar(11) | NOT NULL |  | UK |
| 4 | `country` | char(2) | NOT NULL |  |  |

## corporations

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `corp_id` | integer | NOT NULL | `nextval('corporations_corp_id_seq'::regclass)` | PK |
| 2 | `legal_name` | varchar(150) | NOT NULL |  | UK |
| 3 | `hq_country` | char(2) | NOT NULL |  |  |
| 4 | `base_currency` | char(3) | NOT NULL |  | FK |
| 5 | `tax_id` | varchar(40) | NOT NULL |  | UK |
| 6 | `created_at` | timestamp with time zone | NOT NULL | `now()` |  |

## currencies

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `code` | char(3) | NOT NULL |  | PK |
| 2 | `name` | varchar(60) | NOT NULL |  |  |

## exchange_rates

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `rate_id` | bigint | NOT NULL | `nextval('exchange_rates_rate_id_seq'::regclass)` | PK |
| 2 | `base_currency` | char(3) | NOT NULL |  | UK,FK |
| 3 | `quote_currency` | char(3) | NOT NULL |  | UK,FK |
| 4 | `rate` | numeric(18,8) | NOT NULL |  |  |
| 5 | `effective_at` | timestamp with time zone | NOT NULL | `now()` | UK |
| 6 | `source` | varchar(40) | NOT NULL | `'MANUAL'::character varying` |  |

## routing_corridors

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `corridor_id` | integer | NOT NULL | `nextval('routing_corridors_corridor_id_seq'::regclass)` | PK |
| 2 | `source_bank_id` | integer | NOT NULL |  | UK,FK |
| 3 | `destination_bank_id` | integer | NOT NULL |  | UK,FK |
| 4 | `fee_flat` | numeric(12,2) | NOT NULL | `0` |  |
| 5 | `fee_currency` | char(3) | NOT NULL |  | FK |
| 6 | `fee_percent` | numeric(7,4) | NOT NULL | `0` |  |
| 7 | `latency_minutes` | integer | NOT NULL |  |  |
| 8 | `status` | corridor_status | NOT NULL | `'ACTIVE'::corridor_status` |  |

## subsidiaries

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `subsidiary_id` | integer | NOT NULL | `nextval('subsidiaries_subsidiary_id_seq'::regclass)` | PK,UK |
| 2 | `corp_id` | integer | NOT NULL |  | UK,UK,FK |
| 3 | `name` | varchar(150) | NOT NULL |  | UK |
| 4 | `country` | char(2) | NOT NULL |  |  |
| 5 | `created_at` | timestamp with time zone | NOT NULL | `now()` |  |

## sweep_batches

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `batch_id` | integer | NOT NULL | `nextval('sweep_batches_batch_id_seq'::regclass)` | PK |
| 2 | `corp_id` | integer | NOT NULL |  | FK,FK |
| 3 | `initiated_by` | integer | NOT NULL |  | FK |
| 4 | `note` | varchar(300) | NULL |  |  |
| 5 | `status` | batch_status | NOT NULL | `'COMPLETED'::batch_status` |  |
| 6 | `created_at` | timestamp with time zone | NOT NULL | `now()` |  |

## sweep_transaction_hops

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `txn_id` | bigint | NOT NULL |  | PK,FK |
| 2 | `hop_no` | integer | NOT NULL |  | PK |
| 3 | `corridor_id` | integer | NOT NULL |  | FK |

## sweep_transactions

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `txn_id` | bigint | NOT NULL | `nextval('sweep_transactions_txn_id_seq'::regclass)` | PK |
| 2 | `batch_id` | integer | NOT NULL |  | FK |
| 3 | `transfer_type` | transfer_type | NOT NULL |  |  |
| 4 | `source_account_id` | integer | NOT NULL |  | FK |
| 5 | `destination_account_id` | integer | NOT NULL |  | FK |
| 6 | `source_currency` | char(3) | NOT NULL |  | FK |
| 7 | `destination_currency` | char(3) | NOT NULL |  | FK |
| 8 | `amount_source` | numeric(18,2) | NOT NULL |  |  |
| 9 | `fee_amount` | numeric(18,2) | NOT NULL | `0` |  |
| 10 | `fx_rate` | numeric(18,8) | NOT NULL |  |  |
| 11 | `amount_destination` | numeric(18,2) | NOT NULL |  |  |
| 12 | `latency_minutes` | integer | NOT NULL | `0` |  |
| 13 | `status` | transfer_status | NOT NULL | `'COMPLETED'::transfer_status` |  |
| 14 | `failure_reason` | varchar(300) | NULL |  |  |
| 15 | `memo` | varchar(300) | NULL |  |  |
| 16 | `executed_at` | timestamp with time zone | NOT NULL | `now()` |  |
| 17 | `memo_tsv` | tsvector | NULL |  |  |

## users

| # | Column | Type | Null | Default | Key |
|---|---|---|---|---|---|
| 1 | `user_id` | integer | NOT NULL | `nextval('users_user_id_seq'::regclass)` | PK,UK |
| 2 | `corp_id` | integer | NOT NULL |  | UK,FK |
| 3 | `username` | varchar(40) | NOT NULL |  |  |
| 4 | `full_name` | varchar(120) | NOT NULL |  |  |
| 5 | `email` | varchar(160) | NOT NULL |  |  |
| 6 | `password_hash` | text | NOT NULL |  |  |
| 7 | `role` | user_role | NOT NULL | `'ANALYST'::user_role` |  |
| 8 | `is_active` | boolean | NOT NULL | `true` |  |
| 9 | `last_login_at` | timestamp with time zone | NULL |  |  |
| 10 | `created_at` | timestamp with time zone | NOT NULL | `now()` |  |
| 11 | `updated_at` | timestamp with time zone | NOT NULL | `now()` |  |
