# PropertyOS 0.2 — Rent, investment and business records

A working React/TypeScript app with persistent, encrypted records, ready for your own GitHub repository and Vercel deployment. The package includes the complete source, a built web/PWA app, database setup, tests and deployment instructions. Your business name, address, phone and logo are editable in Settings. Money is stored exactly in integer poisha and displayed in BDT; the default timezone is Asia/Dhaka.

**Start with [START_HERE.md](START_HERE.md).** For online use across your devices, follow [docs/DEPLOY_GITHUB_VERCEL.md](docs/DEPLOY_GITHUB_VERCEL.md).

## What you can use

| Area | Working features |
| --- | --- |
| Property records | Properties, optional buildings/floors, flats, shops, offices, parking and land units; tenant profiles and leases |
| Rent management | Monthly invoices, prorated rent, effective rent changes, meter charges, partial payments, FIFO allocations, advances, receipts, credits, refunds and arrears |
| Expenses | Paid expenses, unpaid vendor bills, contractor records, bill payments, recurring expenses and capital expenditure |
| Property investments | Acquisition/construction/renovation spending, dated valuations and rental-yield/estimated performance reports |
| Other investments | FDRs, shares, business partnerships and other holdings; purchases, received income, redemptions, entered cost basis, realized gains/losses and reversals |
| Owners and capital | Owner/investor directory, contributions, withdrawals and owner-capital history |
| Budgets | Property/month/category budgets with incurred expense comparisons and version history |
| Banking and loans | Cash/bank accounts, balances, transfers, loan funding, actual principal/interest repayments and estimated amortization |
| Operations | Maintenance requests, assignment, priorities, completion history, linked document attachments and document versions |
| Reports | Portfolio, rent roll, collections, statements, arrears, occupancy, property income, cash-flow classes, investment performance, budgets, equity movements and trial balance |
| Data management | Search, filters, sorting, pagination, CSV import/export, A4 PDFs with Bengali fonts, BDT decimal CSV values, audit trail, integrity checks and encrypted backup/restore |
| Access | Local encrypted passphrase; optional cloud owner email/password sign-in followed by workspace passphrase; passphrase rotation and inactivity lock |
| Devices | Responsive browser app and installable PWA. Native desktop/mobile source is retained; compiled native installers are not delivered. |

## Storage choices

**This device:** encrypted SQLite snapshots are saved in IndexedDB. Editing, billing and PDF export work offline after the application assets are installed. This is a real local database, but it belongs to the browser profile and site origin. Export external backups regularly.

**Across devices:** set the two Supabase environment variables and run `supabase/schema.sql`. Supabase Auth identifies the owner; row-level policies restrict access to that owner's encrypted snapshots. Each save commits to the cloud with a revision check. Lock and reopen to read records saved by another device. Cached records can be viewed offline; cloud editing requires internet. There is no offline merge or simultaneous collaboration.

Each cloud account owns a separate business workspace. Multiple financial owners in the ledger do not create staff login roles. This version supports an individual business owner, not shared staff access to one workspace.

## Run locally

Use Node.js 22 or newer, extract the package and open a terminal inside `PropertyOS`:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:1420. To serve the included production build instead:

```sh
node scripts/serve.mjs
```

Open http://127.0.0.1:4173. Always use the same origin/profile for the same local workspace. Do not open `dist/index.html` directly with `file://`.

For cloud development copy `.env.example` to `.env.local` and fill in your project URL and publishable API key. The app works without these variables in local mode.

## Everyday workflow

1. Set the business contact details and logo in Settings.
2. Add properties and units, then tenants and leases. Alternatively import CSVs in Database & backup, in this order: properties, tenants, units, leases.
3. Record initial cash with an opening account balance or an owner contribution. Do not record the same funding twice.
4. Enter meter readings before generating invoices. Use Rent & collections to bill each month; duplicate runs skip existing invoices.
5. Record payments and export receipts. Unused amounts stay as advance credit. Security deposits are tracked separately from income.
6. Record vendor bills, paid expenses, loans and actual investment transactions. Valuations and budgets do not move cash.
7. Review Reports and financial-account statements. Corrections preserve posted records and add dated reversals.
8. Export a complete encrypted backup. After a passphrase change, create a new backup and retain the passphrases for older backups.

Automation catches up only while the application is open; it does not run server jobs or transfer real money. No bank integration, SMS or tenant email delivery is included.

## Development and checks

```sh
npm test
npm run build
```

The 24 executed tests cover real SQLite workflows and PostgreSQL security functions with PGlite. TypeScript and the production build pass. The current browser UI, live Supabase Auth and Vercel deployment were not exercised in this environment. Existing Playwright regression tests are included for a machine with Chromium:

```sh
npx playwright install chromium
npm run test:e2e
```

GitHub Actions runs the core tests and production build on pushes and pull requests. Vercel deploys directly from your repository; no deployment token is required in this source.

## Ownership and limits

You receive the custom source and deployment files and control your own accounts, database and backups. Third-party dependencies retain their licenses. There is no PropertyOS license server or forced subscription. Hosting/database providers have their own plans and limits.

This is a working owner-operated app, not a claim of completed enterprise ERP acceptance or external security/accounting certification. The cloud uses whole encrypted snapshots, with a 64 MB envelope limit and 14 daily snapshots. Large attachments and very large portfolios require performance validation. Staff roles, tax workflows, bank-statement reconciliation, shared tenancy, final automated deposit settlement and native installers remain outside this release. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

PropertyOS 0.1 backups are supported by a durable, additive v1 → v2 migration. Old Rentfolio backups use a different format and are not silently imported. Keep original files until any migration is verified.
