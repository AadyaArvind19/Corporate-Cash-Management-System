# Corporate Cash Management System

Multi-currency liquidity management for corporations with bank accounts in many countries. The system tracks accounts, exchange rates, transfer costs and reserve requirements, and moves excess funds to a central treasury account over the cheapest route, without ever breaching a minimum balance.

**Stack:** PostgreSQL 16 (system of record) · MongoDB (audit trail and sweep snapshots) · Next.js 15 / React 19 / TypeScript

Full project documentation (problem statement, ER diagram, schema, data dictionary, queries, tests, screenshots): [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)

## Setup and run

Requirements: Node 20+, PostgreSQL 16, MongoDB 6/7.

```bash
npm install
cp .env.example .env.local              # edit DATABASE_URL, MONGODB_URI, SESSION_SECRET
createdb ccms && DB_USER=$USER bash db/postgres/rebuild.sh   # builds the schema + demo data
mongosh "mongodb://localhost:27017" db/mongo/init.js
npm run dev                             # http://localhost:3000
```
Production build: `npm run build && npm start`. Set `COOKIE_SECURE=true` behind HTTPS.

## Demo accounts

All demo users share the password `Treasury#2026` (stored only as bcrypt hashes). **Change them before any real use.**

| Username | Role | Corporation |
|---|---|---|
| `admin.ardent` | Admin | Ardent Global Holdings Inc. (USD) |
| `treasurer.ardent` | Treasurer | Ardent Global Holdings Inc. |
| `analyst.ardent` | Analyst (read-only) | Ardent Global Holdings Inc. |
| `admin.brightwater`, `treasurer.brightwater` | Admin, Treasurer | Brightwater Foods Ltd (GBP), a second tenant |

## Roles

| | Admin | Treasurer | Analyst |
|---|:-:|:-:|:-:|
| View dashboard, accounts, plan, history, rates, corridors, reports | ✓ | ✓ | ✓ |
| Execute sweeps, post balances, record rates | ✓ | ✓ | |
| Manage accounts, entities, banks, corridors | ✓ | | |
| Manage users, view audit log | ✓ | | |

## Tests

```bash
npm run db:rebuild                        # fresh demo data (DB_HOST/DB_USER env as needed)
npm run build && npm start &              # for the HTTP tests
npm test                                  # 51 tests: SQL, Mongo pipelines, end-to-end API
```
`TEST_PG_URL` (default `postgresql://postgres@localhost:5432/postgres`) points the DB tests at a server that may create/drop the throw-away `ccms_test` database. `E2E_BASE_URL` overrides the server URL. The end-to-end suite executes a real sweep, so re-run `npm run db:rebuild` before repeating it.

## Project layout

```
db/postgres/init/        01 schema · 02 alter · 03 indexes · 04 functions · 05 triggers · 06 views · 07 seed
db/postgres/queries/     demonstration queries     db/postgres/maintenance/reset.sql   DROP everything
db/mongo/                init.js (collections, validators, indexes) · aggregations.js
src/app/                 pages (App Router) and Route Handlers under src/app/api
src/lib/                 db, mongo, auth, http (API wrapper), services/*, pipelines
src/components/          UI components      tests/   Vitest suites      docs/   documentation
```

## Team

Two-member team. Record each member's responsibilities and commit under your own GitHub accounts so that history shows individual contributions (course requirement 15).

| Member | SRN | Responsibilities |
|---|---|---|
| _name_ | _SRN_ | _e.g. database design, functions/triggers, MongoDB, tests_ |
| _name_ | _SRN_ | _e.g. Next.js app, auth/RBAC, UI, documentation_ |

## Demo script (maps to the evaluation list)

1. Problem and motivation, `docs/DOCUMENTATION.md` §1-3. 2. ER diagram and relational schema, §7-8. 3. Open `db/postgres/init/` and run `queries/important_queries.sql`. 4. Log in as `treasurer.ardent`: Overview → Sweep plan (note the two-hop HDFC → DBS → JPMorgan route and the suspended MUFG corridor) → execute → batch result. 5. Show triggers: try to edit a ledger row in `psql`. 6. Advanced features: §10. 7. Tests: `npm test`. 8. Roles: sign in as `analyst.ardent` (read-only) and `admin.ardent` (users, audit log).
