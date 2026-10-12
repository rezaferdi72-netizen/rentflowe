# PropertyOS 0.2 release status

Updated 2026-10-12. This file describes the delivered source, not a claim of enterprise ERP certification.

## Working application

- Local encrypted SQLite workspace and optional owner cloud sign-in/storage.
- Properties, buildings, floors, units, tenants, historical leases, renewal and dated rent changes.
- Monthly/one-time invoices, proration, meter charges, partial payments, advances, receipts, credits, refunds and deposit liabilities.
- Paid expenses, vendor bills/payments, recurring definitions, capital spending and financial account transfers.
- Property investments, dated valuations, rental yields and explicitly estimated property returns.
- Other investment holdings with purchases, received income, redemptions, entered cost basis, realized gains/losses and dated reversals.
- Owner/investor records and cash/equity contributions/distributions. These are ledger records, not shared login roles.
- Monthly property/category expense budgets and incurred expense comparisons with history.
- Loans, actual principal/interest repayments, integer amortization estimates and classified cash-flow reports.
- Maintenance requests/history, linked encrypted document attachments and immutable document versions.
- Search/filter/sort/pagination, financial statements, PDF/CSV exports and business/logo settings.
- Validated atomic CSV imports for properties, tenants, units and leases.
- Encrypted portable backups, verified full restore, previous-save recovery, selectable daily history and passphrase rotation.
- Additive durable v1 → v2 database migration and v1 backup restore.
- Vercel configuration, environment template, Supabase SQL, GitHub CI and detailed setup guide.
- Full source and built web/PWA app included. No demo data or real business data is seeded.

## Verified in this delivery

- 24/24 automated tests pass: SQLite rental/accounting workflows, portfolio investment transactions, owner capital, cash-flow reconciliation, budget history, strict CSV imports, encryption rotation and legacy migration.
- Cloud adapter tests verify stale-write rollback, read-only offline cache, authorization failure behavior, cache failure after a confirmed commit and no-op revision handling.
- PostgreSQL functions/policies execute in PGlite and pass owner isolation, permission, compare-and-swap, snapshot integrity and 14-day-history retention tests.
- Strict TypeScript and Vite production build pass.

## Verification still required in your deployment

- Browser UI checks for this updated version and physical phone usability. Browser-control tooling was unavailable in this authoring session; existing Playwright tests are included but were not rerun.
- Your live Supabase owner login, email-reset configuration and PostgREST behavior.
- Actual GitHub import and Vercel deployment, cross-device operation and backup recovery on your devices.
- Native Tauri desktop/mobile compilation, signing and platform testing. Retained source does not mean an installer has been built.

## Scope and limits

- One authenticated owner controls each cloud workspace. Staff roles, invitation/sharing, concurrent staff collaboration and automatic offline merge are not implemented.
- Local mode supports offline writes. Cloud mode requires internet for writes and allows encrypted cached viewing offline.
- Cloud persistence saves the whole encrypted SQLite snapshot, not a normalized multi-user server ERP. Maximum envelope size is 64 MB; cloud daily history retains 14 snapshots, local browser history seven. Large attachment sets and portfolios need performance validation.
- Billing/recurring automation only runs while the app is open. No real-money bank transfers, bank synchronization, SMS or tenant-email sending are performed.
- Tax/VAT invoice workflows, bank-statement reconciliation, shared tenancy, automated final deposit settlement, property asset sale/disposal and dated ownership-share allocation are not implemented.
- Standalone financial investment redemption is supported; property-sale realized returns and cash-on-cash property return measures are separate unfinished features.
- Currency is BDT; UI is English with Bengali record/PDF font support. Full Bangla UI is not implemented.
- External security/accounting audit, native crash recovery and high-volume scale testing have not been completed.
