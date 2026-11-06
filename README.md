# Corporate Cash Management System (CCMS)

A multi-currency liquidity management system designed for corporations operating across multiple countries. The system manages corporate bank accounts, exchange rates, transfer costs, routing corridors and minimum reserve requirements. It identifies surplus funds and plans transfers to a central treasury account through cost-effective routes while ensuring that minimum account balances are maintained.

The project operates in a simulated environment using sample corporate accounts, currencies, exchange rates and banking corridors. It does not connect to live banking systems or execute real financial transactions.

## Technology Stack

- **Frontend:** Next.js 15, React 19, TypeScript
- **Database:** PostgreSQL 15 (primary relational database)
- **NoSQL Database:** MongoDB Atlas (audit events and sweep execution snapshots)
- **Testing:** Vitest, database integration tests and API end-to-end tests

## Project Documentation

Complete project documentation, including the problem statement, ER diagram, relational schema, data dictionary, SQL queries, database implementation, testing results and screenshots, is available here:

[Project Documentation](docs/DOCUMENTATION.md)

## Setup and Execution

### Prerequisites

Install the following before running the project:

- Node.js 20 or later
- npm
- PostgreSQL 15
- MongoDB Atlas account or a local MongoDB installation

### 1. Clone the repository

```bash
git clone https://github.com/AadyaArvind19/Corporate-Cash-Management-System.git
cd Corporate-Cash-Management-System
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local environment file by copying the example:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env.local
```

**Windows Command Prompt:**

```cmd
copy .env.example .env.local
```

Open `.env.local` and configure the following values:

- `DATABASE_URL` – PostgreSQL connection string
- `MONGODB_URI` – MongoDB connection URI
- `MONGODB_DB` – MongoDB database name (`ccms`)
- `SESSION_SECRET` – Secret used for session management
- `COOKIE_SECURE` – Set to `false` for local development

Never upload `.env.local` or other files containing credentials to GitHub.

### 4. Set up PostgreSQL

Create a PostgreSQL database named `ccms` and configure the database credentials in `.env.local`.

The PostgreSQL initialization scripts are available in:

```text
db/postgres/init/
```

These scripts create the database schema, apply alterations, create indexes, define functions and triggers, create views and insert sample data.

The project also includes a database rebuild script:

```text
db/postgres/rebuild.sh
```

Use the database initialization procedure appropriate to your operating system and configured PostgreSQL credentials.

### 5. Set up MongoDB

The MongoDB initialization and aggregation scripts are available in:

```text
db/mongo/
```

Configure `MONGODB_URI` and `MONGODB_DB` in `.env.local` before running the application.

The application uses MongoDB to store audit events and sweep execution snapshots.

### 6. Start the application

```bash
npm run dev
```

Open the application in your browser:

```text
http://localhost:3000
```

### Production Build

To create and run a production build:

```bash
npm run build
npm start
```

When deploying behind HTTPS, configure:

```text
COOKIE_SECURE=true
```

## Demo Accounts

The following demo accounts are available for testing the application's role-based access control.

All demo users share the password:

```text
Treasury#2026
```

| Username | Role | Corporation |
|---|---|---|
| `admin.ardent` | Admin | Ardent Global Holdings Inc. (USD) |
| `treasurer.ardent` | Treasurer | Ardent Global Holdings Inc. |
| `analyst.ardent` | Analyst (Read-only) | Ardent Global Holdings Inc. |
| `admin.brightwater` | Admin | Brightwater Foods Ltd. (GBP) |
| `treasurer.brightwater` | Treasurer | Brightwater Foods Ltd. (GBP) |

These credentials are intended strictly for demonstration and testing. Change the demo credentials before any real deployment.

## User Roles and Permissions

The application implements role-based access control with three roles.

| Functionality | Admin | Treasurer | Analyst |
|---|:---:|:---:|:---:|
| View dashboard, accounts, sweep plans, history, rates, corridors and reports | ✓ | ✓ | ✓ |
| Execute sweeps, post balances and record rates | ✓ | ✓ | |
| Manage accounts, entities, banks and corridors | ✓ | | |
| Manage users and view audit logs | ✓ | | |

The Analyst role provides read-only access to the permitted application modules.

## Testing

The project includes database integration tests, MongoDB pipeline tests and API end-to-end tests.

### Run the test suite

```bash
npm test
```

The test suite covers:

- PostgreSQL database operations and validation
- MongoDB aggregation pipelines
- API functionality and end-to-end application workflows
- Cash sweep execution and related operations

The test suite is designed to use a dedicated test database. Configure `TEST_PG_URL` to point to a PostgreSQL server where the test process is permitted to create and drop the temporary `ccms_test` database.

The default test database connection is:

```text
postgresql://postgres@localhost:5432/postgres
```

`E2E_BASE_URL` can be configured to override the application server URL used by the end-to-end tests.

**Important:** The end-to-end test suite executes a real sweep within the test environment. Rebuild the demo database using `npm run db:rebuild` before repeating the suite, where appropriate.

### Run HTTP end-to-end tests

Start the production server in one terminal:

```bash
npm run build
npm start
```

Run the tests in another terminal:

```bash
npm test
```

## Project Structure

```text
Corporate-Cash-Management-System/
│
├── db/
│   ├── postgres/
│   │   ├── init/          PostgreSQL schema, alterations, indexes,
│   │   │                  functions, triggers, views and seed data
│   │   ├── queries/       Important SQL demonstration queries
│   │   ├── maintenance/   Database maintenance scripts
│   │   └── rebuild.sh     Database rebuild script
│   │
│   └── mongo/
│       ├── init.js        MongoDB collection initialization
│       └── aggregations.js MongoDB aggregation pipelines
│
├── src/
│   ├── app/
│   │   ├── (app)/         Application pages
│   │   ├── api/           Next.js API route handlers
│   │   └── login/         Login page
│   │
│   ├── components/        Frontend UI components
│   │
│   ├── lib/
│   │   ├── services/      Account, dashboard, reports,
│   │   │                  reference data and sweep services
│   │   ├── auth.ts        Authentication utilities
│   │   ├── db.ts          PostgreSQL connection
│   │   ├── mongo.ts       MongoDB connection
│   │   ├── audit.ts       Audit event handling
│   │   └── pipelines.ts   MongoDB pipeline utilities
│   │
│   └── middleware.ts     Application middleware
│
├── tests/
│   ├── api.e2e.test.ts
│   ├── db.integration.test.ts
│   └── pipelines.test.ts
│
├── docs/
│   ├── DOCUMENTATION.md
│   ├── DATA_DICTIONARY.md
│   ├── er-diagram.mmd
│   └── screenshots/
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Team Contributions

The project was developed by a two-member team.

### Team Member 1 – Aadya Arvind

**Contribution A:**

- Account management and bank account functionality
- Corporate entities and subsidiary management
- PostgreSQL database schema, constraints and indexes
- Account-related database queries and validation
- Testing and documentation of the implemented modules

### Team Member 2 – Aanya K

**Contribution B:**

- Exchange rate and currency management
- Routing corridors and route finder functionality
- Cash sweep planning and execution
- MongoDB audit events and sweep execution snapshots
- Testing and documentation of the implemented modules

### Joint Contributions

Both team members contributed to:

- Authentication and role-based access testing
- Reports and dashboard verification
- Frontend and API integration
- README and project setup instructions
- Final integration testing and project demonstration

## Git and GitHub

The project source code is maintained in GitHub:

[Corporate Cash Management System Repository](https://github.com/AadyaArvind19/Corporate-Cash-Management-System)

Both team members maintain individual commits under their respective GitHub accounts to demonstrate their contributions, along with shared integration work.

## Project Demonstration

The following sequence can be used to demonstrate the major system functionalities:

1. **Problem Statement and Motivation:** Explain the need for centralized corporate liquidity management.
2. **ER Diagram and Relational Schema:** Present the ER diagram and PostgreSQL database design.
3. **Database Implementation:** Demonstrate the SQL schema, important queries, indexes, functions and triggers.
4. **Cash Sweep Planning:** Log in as `treasurer.ardent` and navigate to Overview → Sweep Plan. Demonstrate the suggested transfer routes, including the HDFC → DBS → JPMorgan route and the suspended MUFG corridor.
5. **Sweep Execution:** Execute a sweep and demonstrate the resulting transfer batch.
6. **Database Triggers:** Demonstrate how account balance changes are recorded and how ledger records are protected.
7. **MongoDB Integration:** Show audit events and sweep execution snapshots stored in MongoDB.
8. **Advanced Features:** Demonstrate the additional features described in Section 10 of the project documentation.
9. **Testing:** Run the project test suite using `npm test`.
10. **Role-Based Access Control:** Log in as `analyst.ardent` to demonstrate read-only access and as `admin.ardent` to demonstrate administrative functionality.

---

**Note:** This project is an academic demonstration of a corporate cash management system and uses simulated financial data. It is not intended for processing actual banking transactions.
