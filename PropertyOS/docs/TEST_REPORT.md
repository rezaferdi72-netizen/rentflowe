# Validation report — PropertyOS 0.2

Date: 2026-10-12. Environment: Linux, Node 24.19.0, sql.js 1.14.2. The current release passes **24/24 automated tests**, strict TypeScript compilation and the Vite production build.

## Executed

- Original 11 SQLite/domain scenarios: Green Tower rent/receipts/carry-forward, additive reversal history, vacant/overlapping/renewed leases, proration, advances/refunds/credits, deposits/vendor bills/capex/loans, encryption/restore/conflicts, save rollback, recurring idempotency, meters/maintenance/documents and exact arithmetic/profile history.
- Eight expanded scenarios: CSV syntax and Bengali cells; exact taka CSV exports and spreadsheet-text protection; atomic linked imports; investment cost-basis/returns/redemptions/reversals; owner capital plus cash-flow reconciliation; budget changes/actuals/corrections; durable passphrase rotation and failed rotation; persisted v1 open/backup migration.
- Four cloud-adapter scenarios: stale device rollback/reopen; offline viewing/read-only behavior with no authorization-error fallback; confirmed server commit despite failed device cache; no-op/idle automation avoiding gratuitous revisions.
- One PostgreSQL/PGlite scenario executing the actual delivered Supabase SQL: two-owner RLS isolation, anonymous denial, direct-write denial, expected revision checks, encrypted-envelope shape, current-envelope backup integrity, recovery preservation and 14-day retention.

Tests use generated fixtures only. There are no real owner passwords, live records or remote test writes in this package.

## Not executed in this delivery

- Browser UI/Playwright for the updated application: browser-control tooling was unavailable. The existing E2E suite is retained and should be run on your computer with Chromium.
- Live Supabase Auth/PostgREST, configured SMTP/reset emails or a real Vercel deployment. The SQL and adapter were exercised locally; this does not prove your provider settings.
- Native Tauri builds/installers, phone hardware QA, security penetration tests, external accounting review, large-scale load testing or native crash/power-loss recovery.

The earlier package documented v0.1 browser/PDF checks. Those are historical results and do not establish browser verification of the new v0.2 screens.

Commands: `npm test`, `npm run build`. After your deployment, follow the live checks in `DEPLOY_GITHUB_VERCEL.md`.
