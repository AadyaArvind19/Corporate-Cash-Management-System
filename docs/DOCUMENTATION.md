# Corporate Cash Management System: Project Documentation

DBMS Experiential Learning, Level 3 project. Stack: **PostgreSQL 16** (SQL) + **MongoDB** (NoSQL) + **Next.js 15**.

---

## 1. Problem statement

Global companies have bank accounts across different countries and currencies. Some accounts may have excess funds, while others need to maintain a minimum balance. This project develops a database-driven system that tracks these accounts, exchange rates, transfer costs, and reserve requirements, and helps companies efficiently move excess funds to a central treasury account while maintaining financial constraints.

## 2. Objectives

1. Track every bank account of a corporation and its subsidiaries, across banks, countries and currencies.
2. Keep exchange rates (with full history) and bank-to-bank transfer corridors (fees, latency, availability).
3. Enforce **reserve requirements**: no transfer may push an account below its minimum balance.
4. Compute and execute **sweeps**: surplus from operating accounts to the central treasury account at the lowest transfer cost, including multi-hop routes.
5. Restore reserves of under-funded accounts from the treasury (**funding**), without breaching the treasury's own reserve.
6. Provide an auditable, tamper-resistant record of every balance change and transfer.
7. Offer role-based access (Admin, Treasurer, Analyst) through a professional web interface.

## 3. Scope

**In scope:** multi-tenant corporate structure (corporations, subsidiaries), bank directory, accounts with reserves and sweep thresholds, exchange-rate history, routing corridors and cheapest-route search, sweep/funding planning and atomic execution, balance reconciliation, reports, user management, audit trail, authentication and authorisation.

**Out of scope:** live bank connectivity (SWIFT/ISO 20022 feeds), real FX market data feeds, payment initiation to real banks, interest/yield optimisation, approval workflows with multiple signatories. Balances are entered by operators ("post statement balance") instead of being pulled from banks. Banks, corridors and exchange rates are shared reference data: any administrator can edit corridors, as the deployment is assumed to be one organisation.

**Vector search:** optional in the requirements and intentionally **not** used. The data is structured and numeric; embeddings would be technology for its own sake (requirement 18).

## 4. Functional requirements

| ID | Requirement |
|---|---|
| F1 | Users sign in with a username and password; sessions expire after 8 hours. |
| F2 | Three roles: **Admin** (entities, accounts, corridors, users, audit), **Treasurer** (execute sweeps, post balances, record rates), **Analyst** (read-only). |
| F3 | Dashboard: total cash, treasury cash, idle surplus, reserve shortfall (base currency), alerts, exposure by currency, balance-vs-reserve chart. |
| F4 | Accounts: list/search/filter, detail with balance history and transfers, create, edit, freeze/close, delete (only when no history). |
| F5 | Post a statement balance with a reason (audited). |
| F6 | Exchange rates: latest quotes with 7-day change, 90-day history, append-only entry of new quotes. |
| F7 | Corridors: list, create, edit fees/latency/status, delete; route finder returning all paths ordered by total cost. |
| F8 | Sweep plan: per-account action (SWEEP / FUND / NONE / NO_ROUTE / INSUFFICIENT_TREASURY), fee, FX rate, route, totals; operator selects transfers and executes. |
| F9 | Execution is atomic per transfer, one failure never corrupts other transfers, failures are recorded. |
| F10 | Transfer history with filters (account, type, status, dates) and full-text memo search; batch detail pages. |
| F11 | Reports: corridor cost (HAVING), weekly volume (window function), fee cost by subsidiary, currency exposure, above-average accounts (subquery), plus MongoDB analytics. |
| F12 | Administration: users (create, role, disable, reset password, delete with last-admin protection), subsidiaries, banks, audit log viewer. |

## 5. System architecture

```mermaid
flowchart LR
  B[Browser] -->|HTTPS| N
  subgraph N[Next.js 15 application]
    M[Middleware: signed-session check] --> P[Server-rendered pages]
    M --> A[Route Handlers /api/*]
    P --> S[Service layer]
    A --> S
    S --> V[zod validation, RBAC, error mapping]
  end
  S -->|pg, parameterised SQL| PG[(PostgreSQL 16)]
  S -->|mongodb driver| MG[(MongoDB)]
  PG --- F1[tables, constraints, triggers, views, stored functions]
  MG --- F2[audit_events, sweep_run_snapshots]
```

* **Presentation:** Next.js App Router. Pages are server components; forms are client components calling the API.
* **API layer:** Route Handlers under `src/app/api`, all wrapped by `route()` (`src/lib/http.ts`): authentication, role check, same-origin check on writes, zod validation, PostgreSQL error → HTTP mapping.
* **Service layer:** `src/lib/services/*` holds all SQL/Mongo access.
* **Business rules live in the database:** planning, routing, execution, validation (functions, triggers, constraints), so no client can bypass them.
* **Configuration:** only environment variables (`DATABASE_URL`, `MONGODB_URI`, `SESSION_SECRET`…). Nothing sensitive is in the source.
* **Failure isolation:** PostgreSQL is the system of record. MongoDB writes (audit, snapshots) are best effort with a circuit breaker, so an audit outage never blocks treasury operations, and the UI says so when MongoDB is unreachable.

## 6. Database choice and justification

| Data | Store | Why |
|---|---|---|
| Corporations, subsidiaries, accounts, balances, reserves, rates, corridors, batches, transfers, users | **PostgreSQL** | Money movement needs ACID transactions, row locking, foreign keys, CHECK constraints and `NUMERIC` exactness. Strongly relational data with many integrity rules. Recursive CTEs solve the route search natively. |
| Audit events (who did what, from where, outcome) | **MongoDB** | Append-only, high-volume, heterogeneous `details` payloads per action type (a login failure, a sweep, a corridor edit carry different fields). Schemaless documents with TTL retention suit this better than a wide nullable table. Queried by time/actor/action with group-by analytics. |
| Sweep run snapshots (evidence pack per executed batch) | **MongoDB** | Each batch is one self-contained, immutable document: transfers → route hops → rate snapshot, nested and variable-length. It is read as a whole and aggregated with `$unwind`/`$group`, which is awkward as 4+ joined tables. |
| Embeddings | not used | Not applicable to this data. |

PostgreSQL remains authoritative; MongoDB documents can always be rebuilt from SQL (snapshots) or are supplementary (audit).

## 7. ER diagram

![ER diagram](er-diagram.png)

(Source: `docs/er-diagram.mmd`.) Cardinalities: a corporation has many subsidiaries, users, accounts and batches; a subsidiary has many accounts; a bank hosts many accounts and is source/destination of many corridors; a batch contains many transfers; a transfer debits one account, credits another and is routed through 0..3 corridors (`sweep_transaction_hops`, the associative entity resolving the many-to-many between transfers and corridors).

## 8. Relational schema

PK = primary key, FK = foreign key (→ target), UK = unique.

```
currencies(code PK)
banks(bank_id PK, name, swift_bic UK, country)
corporations(corp_id PK, legal_name UK, hq_country, base_currency FK→currencies, tax_id UK, created_at)
subsidiaries(subsidiary_id PK, corp_id FK→corporations, name, country, UK(corp_id,name), UK(subsidiary_id,corp_id))
users(user_id PK, corp_id FK→corporations, username, full_name, email, password_hash, role, is_active,
      last_login_at, created_at, updated_at, UK(user_id,corp_id))
bank_accounts(account_id PK, corp_id, subsidiary_id, bank_id FK→banks, currency FK→currencies, nickname,
      account_number, account_type, balance, min_reserve, min_sweep_amount, status, created_at, updated_at,
      last_reconciled_at, search_text, search_tsv,
      FK(subsidiary_id,corp_id)→subsidiaries(subsidiary_id,corp_id), UK(bank_id,account_number), UK(account_id,corp_id))
exchange_rates(rate_id PK, base_currency FK, quote_currency FK, rate, effective_at, source, UK(base,quote,effective_at))
routing_corridors(corridor_id PK, source_bank_id FK→banks, destination_bank_id FK→banks, fee_flat, fee_currency FK,
      fee_percent, latency_minutes, status, UK(source_bank_id,destination_bank_id))
sweep_batches(batch_id PK, corp_id FK→corporations, initiated_by, note, status, created_at,
      FK(initiated_by,corp_id)→users(user_id,corp_id))
sweep_transactions(txn_id PK, batch_id FK→sweep_batches, transfer_type, source_account_id FK→bank_accounts,
      destination_account_id FK→bank_accounts, source_currency FK, destination_currency FK, amount_source, fee_amount,
      fx_rate, amount_destination, latency_minutes, status, failure_reason, memo, executed_at, memo_tsv)
sweep_transaction_hops(txn_id FK→sweep_transactions, hop_no, corridor_id FK→routing_corridors, PK(txn_id,hop_no))
balance_history(history_id PK, account_id FK→bank_accounts, old_balance, new_balance, reason, changed_by FK→users,
      txn_id FK→sweep_transactions, changed_at)
```

Design notes: the composite foreign keys `(subsidiary_id, corp_id)` and `(initiated_by, corp_id)` make it **impossible** to link rows across corporations (tenant integrity enforced by the database). Tables are in 3NF; `corp_id` on `bank_accounts` and the currency columns on `sweep_transactions` are deliberate, constraint-protected denormalisations (needed for the one-treasury-per-corporation index and for immutable currency snapshots).

Constraints include: `CHECK balance >= 0`, `min_reserve >= 0`, `rate > 0`, `base <> quote`, `source bank <> destination bank`, `fee_percent` between 0 and 5, bcrypt-only `password_hash` (`^\$2[aby]\$…`), username/email/SWIFT/country format checks, closed accounts must have zero balance, failed transfers must carry a reason, partial unique index "one open treasury per corporation".

## 9. NoSQL data model (MongoDB)

Created by `db/mongo/init.js` (JSON-Schema validators, `validationLevel: strict`).

**`audit_events`**
```json
{ "ts": "ISODate", "corpId": 1,
  "actor": { "userId": 2, "username": "treasurer.ardent", "role": "TREASURER" },
  "action": "SWEEP_BATCH_EXECUTED", "outcome": "SUCCESS",
  "entity": { "type": "sweep_batch", "id": 19 }, "ip": "203.0.113.7", "details": { "accounts": "all" } }
```
Indexes: `{corpId, ts:-1}`, `{action, ts:-1}`, `{actor.userId, ts:-1}`, TTL on `ts` (730 days).

**`sweep_run_snapshots`** (one document per batch; values illustrative)
```json
{ "batchId": 19, "corpId": 1, "ts": "ISODate", "baseCurrency": "USD", "initiatedBy": "treasurer.ardent",
  "summary": { "completed": 10, "failed": 0, "volumeBase": 5361269.21, "feesBase": 3133.08 },
  "transfers": [ { "txnId": 120, "type": "SWEEP", "status": "COMPLETED",
      "from": { "accountId": 7, "label": "India Operating", "bank": "HDFC Bank", "currency": "INR" },
      "to":   { "accountId": 1, "label": "Group Treasury - USD", "bank": "JPMorgan Chase Bank", "currency": "USD" },
      "amountSource": 17482304.44, "fee": 17695.56, "fxRate": 0.01199041, "amountDestination": 209620.00,
      "route": [ { "hop": 1, "corridorId": 9, "fromBank": "HDFC Bank", "toBank": "DBS Bank", "latencyMinutes": 180 },
                 { "hop": 2, "corridorId": 5, "fromBank": "DBS Bank", "toBank": "JPMorgan Chase Bank", "latencyMinutes": 300 } ] } ],
  "rates": [ { "pair": "USD/INR", "rate": 83.4, "effectiveAt": "ISODate" } ] }
```
Indexes: unique `{batchId}`, `{corpId, ts:-1}`, multikey `{transfers.route.corridorId}`.

**Retrieval strategy:** audit viewer uses `find` with `corpId` (+ optional action/outcome/actor) sorted by `ts` using the compound indexes; analytics use the aggregation pipelines in `src/lib/pipelines.ts` (`activityByAction`, `failedLogins`, `corridorCost` with two `$unwind` stages, `batchEfficiency`). No embeddings or vectors are involved.

## 10. SQL / NoSQL implementation

| File | Content |
|---|---|
| `db/postgres/init/01_schema.sql` | `CREATE EXTENSION/TYPE/TABLE`, PKs, FKs, UNIQUE, CHECK |
| `02_alter_schema.sql` | `ALTER TABLE` (add columns, set default, add constraints, change type) |
| `03_indexes.sql` | `DROP INDEX` + composite replacement, partial, unique-partial, expression, GIN indexes |
| `04_functions.sql` | `get_fx_rate`, `find_routes` (recursive CTE), `plan_cash_position`, `execute_transfer`, `execute_sweep_batch`, `post_balance_update`, `search_accounts` |
| `05_triggers.sql` | audit, validation, append-only, identity protection, search maintenance |
| `06_views.sql` | `v_latest_rates`, `v_account_positions`, `v_corporate_liquidity`, `v_sweep_ledger` |
| `07_seed.sql` | two corporations, 19 accounts, 12 banks, 27 corridors, 847 rate quotes, 12 weeks of history |
| `maintenance/reset.sql` | `DROP` of every object in dependency order (verified: leaves zero objects) |
| `queries/important_queries.sql` | the demonstration queries listed in section 11 |
| `db/mongo/init.js`, `aggregations.js` | collections, validators, indexes, pipelines |

### Advanced database concepts demonstrated (requirement: at least four; **eight** are used)

1. **Transactions:** `execute_sweep_batch` runs one DB transaction under `pg_advisory_xact_lock(corp)`; each transfer is a sub-transaction (savepoint via `BEGIN … EXCEPTION`), so one failure is rolled back and recorded as `FAILED` while the batch continues (`PARTIAL`). `execute_transfer` locks both accounts with `SELECT … FOR UPDATE` in id order (deadlock-free).
2. **Views:** `v_account_positions`, `v_corporate_liquidity`, `v_sweep_ledger`, `v_latest_rates`.
3. **Stored functions/procedures:** ten functions (above); planning, routing and execution are done inside the database.
4. **Triggers:** `log_balance_change`, `log_opening_balance`, `validate_transfer`, `rates_append_only`, `transactions_append_only`, `protect_account_identity`, `set_updated_at`, `refresh_account_search`, cascade search refresh.
5. **Indexing:** composite, partial, unique-partial (`uq_one_treasury_per_corp`), expression (`lower(username)`), GIN; plan evidence in test "uses the GIN index".
6. **Full-text search:** `tsvector` generated column on transfer memos, trigger-maintained `tsvector` on accounts, GIN indexes, `websearch_to_tsquery` and prefix `to_tsquery`.
7. **Recursive CTE:** `find_routes` explores corridor paths up to three hops, avoiding cycles, costing flat+percentage fees in the sender's currency.
8. **NoSQL aggregation:** MongoDB `$match/$group/$unwind/$project/$sort/$cond` pipelines.

## 11. Important queries

All are in `db/postgres/queries/important_queries.sql` and executed by the application:

| # | Technique | Purpose |
|---|---|---|
| Q1 | JOIN, ORDER BY | account positions per corporation (view) |
| Q2 | GROUP BY, SUM | cash and surplus per subsidiary |
| Q3 | GROUP BY … HAVING | corridors that charged more than 100 USD fees |
| Q4 | Correlated subquery | operating accounts above their currency average |
| Q5 | NOT EXISTS | accounts that never took part in a transfer |
| Q6 | Window function | weekly swept volume with running total |
| Q7 | Recursive CTE | cheapest HDFC → JPMorgan route |
| Q8 | Stored function | live sweep/funding plan |
| Q9 | Full-text search | accounts ("sing op"), memos ("payroll cover") |
| Q10 | DML | `INSERT`, `UPDATE`, `DELETE` (in a rolled-back transaction) |
| Q11 | `EXPLAIN ANALYZE` | index usage evidence |

**How a sweep is computed** (`plan_cash_position`): for each active operating account, `surplus = balance − min_reserve`. If `surplus ≥ min_sweep_amount`, the cheapest route to the treasury bank is found; because fees come out of the sending account, `amount = (surplus − flat) / (1 + pct/100)`, rounded down so `amount + fee ≤ surplus`. The converted amount uses the latest rate (inverse or USD-triangulated if needed). Accounts below reserve are funded from treasury in descending shortfall order until the treasury's own surplus is exhausted.

## 12. Application screenshots

| | |
|---|---|
| ![Login](screenshots/01-login.png) Login | ![Overview](screenshots/02-overview.png) Overview |
| ![Accounts](screenshots/03-accounts.png) Accounts | ![Search](screenshots/04-accounts-search.png) Full-text account search |
| ![Account](screenshots/05-account-detail.png) Account detail and balance history | ![Plan](screenshots/06-sweep-plan.png) Sweep plan |
| ![Rates](screenshots/07-rates.png) Exchange rates | ![Route](screenshots/08-corridors-route-finder.png) Corridors and route finder |
| ![Reports](screenshots/09-reports.png) Reports | ![History](screenshots/10-history-search.png) Transfer history with memo search |
| ![Batch](screenshots/11-batch-result.png) Executed batch | ![After](screenshots/12-plan-after-execution.png) Plan after execution (nothing left to sweep) |
| ![Users](screenshots/13-admin-users.png) Users | ![Entities](screenshots/14-admin-structure.png) Entities and banks |
| ![Audit](screenshots/15-admin-audit.png) Audit log (see note) | ![Analyst](screenshots/16-analyst-readonly-plan.png) Analyst: read-only |

*Note:* these screenshots were captured in an environment without a MongoDB server, so the audit log and MongoDB analytics show their "store unreachable" state. With MongoDB running they show data.

## 13. Testing results

Full output: `docs/test-results.txt`. **51 tests, 51 passed** (Vitest 3).

| Suite | Tests | Scope |
|---|---|---|
| `tests/db.integration.test.ts` | 29 | Built from `init/*.sql` in a throw-away database: constraints, triggers, append-only ledgers, FX cross rates, routing (multi-hop, suspended corridor, same-bank, no route), planning rules, atomic execution, savepoint failure handling, role checks, balance audit, full-text search, tenant scoping, index use |
| `tests/pipelines.test.ts` | 4 | The four MongoDB aggregation pipelines over representative documents, evaluated with the `mingo` engine |
| `tests/api.e2e.test.ts` | 18 | HTTP against the built Next.js server: authentication, cookie flags, forged token, RBAC for all three roles, tenant isolation, validation, cross-origin rejection, SQL-injection attempt, friendly DB errors, password strength, last-admin protection, plan, route finder, rate entry, balance posting, batch execution |

Manual verification: all 17 pages rendered (screenshots), build with `next build` and `tsc --noEmit` clean, `reset.sql` leaves no objects.

**Limitation (honest):** the MongoDB driver code (`src/lib/mongo.ts`, `audit.ts`, snapshot writes, audit viewer) could not be run against a live MongoDB in the development sandbox (downloads blocked). The pipelines and document shapes are unit-tested with an in-process engine and the failure path (store down) is verified end to end, but start MongoDB, run `mongosh db/mongo/init.js`, and perform one sweep to confirm the live Mongo path on your machine.

## 14. Security summary

* Passwords hashed with bcrypt (cost 12); the database rejects any non-bcrypt value in `password_hash`. No credentials in source; `.env` is git-ignored.
* Sessions: signed JWT (HS256) in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` when `COOKIE_SECURE=true`), re-validated against the database on each request (instant effect of disabling a user).
* Login throttling (5 failures / 15 min per user+IP), identical error for unknown user and wrong password, constant-time dummy hash comparison.
* All SQL parameterised; inputs validated with zod and again by database constraints; same-origin check on state-changing calls; security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).
* Least privilege by role in API and pages; tenant isolation by `corp_id` scoping plus composite foreign keys.

## 15. Conclusion and future enhancements

The system demonstrates the full path from database design to a working web product: a constraint-rich relational core, business logic executed transactionally in the database, a graph-like route search with a recursive query, and a document store used only where documents fit. Planned enhancements: live bank statement import (camt.053/MT940) to replace manual balance posting; scheduled automatic sweeps; two-person approval for large batches; scheduled FX feed; corridor limits and cut-off times; interest-aware target balances and notional pooling; per-tenant corridor/bank ownership; reporting exports; row-level security in PostgreSQL as a second tenant-isolation layer.

---

## Appendix A. Requirement traceability (course document, sections 1-18)

| § | Requirement | Where it is met |
|---|---|---|
| 1 | Unique, meaningful, non-CRUD project | Corporate Cash Management System: planning, routing, execution logic |
| 2 | 2-member team, defined responsibilities | **Team action:** assign responsibilities in README "Team" section |
| 3 | SQL + NoSQL (Option 1), MySQL/PostgreSQL mandatory | PostgreSQL 16 + MongoDB |
| 4 | ER diagram → relational schema; NoSQL data model | Sections 7, 8, 9 |
| 5 | DDL: CREATE, ALTER, DROP, keys, constraints, indexes, views | `01`-`03`, `06`, `reset.sql` |
| 6 | DML + JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | Section 11 |
| 7 | At least four advanced concepts | Eight, section 10 |
| 8 | Vector search (optional) | Not used, justified in section 3/6 |
| 9 | Next.js web interface with forms, tables, search, filters, dashboards | 17 screens |
| 10 | API layer, no hard-coded credentials, env variables | Route Handlers; `src/lib/env.ts`; `.env.example` |
| 11 | Authentication, ≥ 2 roles | 3 roles |
| 12 | DB-level validation and integrity | Constraints and triggers, section 8/10 |
| 13 | Basic security, no plain-text passwords/credentials | Section 14 |
| 14 | Documentation items (13 listed) | This document, sections 1-13 and 15 |
| 15 | Git/GitHub, individual commits, README with setup | README; **team action:** commit under your own accounts |
| 16 | Demonstration content | Sections map 1:1 to the demo list; see README "Demo script" |
| 17 | Originality | Original design; no tutorial/repository copied |
| 18 | Beyond CRUD; justified database choice | Sections 6, 10 |
