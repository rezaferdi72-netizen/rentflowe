# Architecture

## Data flow

React forms and reports use `PropertyService` for validation and exact double-entry postings. `Vault` serializes SQLite writes, validates foreign keys/invoice totals/journal balance, encrypts the committed database and awaits persistence. Failed saves restore the preceding database snapshot. No-op transactions do not advance the saved revision. Restore and passphrase rotation use the same write queue.

Money is integer poisha. Rent proration, sum/rate calculations and loan estimates use integer arithmetic. Posted financial rows are immutable; supported corrections add dated reversal journals. Profile and budget updates retain prior versions.

| Layer | Files |
| --- | --- |
| UI and forms | `src/ui/App.tsx`, `forms.ts`, `DataImport.tsx`, `ConnectionGate.tsx` |
| Business/accounting | `src/core/service.ts`, `money.ts`, `imports.ts` |
| SQLite/encryption | `src/core/vault.ts`, `schema.sql`, `schema.ts`, `migrations.ts` |
| Local persistence | `src/core/storage.ts` |
| Cloud adapter | `src/core/cloud-storage.ts`, `cloud.ts` |
| Cloud SQL permissions/functions | `supabase/schema.sql` |
| PDF/CSV | `src/ui/documents.ts` |

## Schema versions

`schema.sql` is the original relational foundation, generated into `schema.ts` during builds. `migrations.ts` adds schema version 2: owner transactions, financial investment holdings/transactions, expense budgets and investment accounts. A v1 open upgrades in a queued transaction and persists the encrypted v2 snapshot before returning. Restore also migrates a candidate before it becomes the active workspace. Higher unsupported versions fail safely.

## Encryption

PBKDF2-SHA256 with 310,000 iterations and a random 16-byte salt derives an AES-256-GCM key from a passphrase of at least 12 characters. Every snapshot has a new random 12-byte nonce; vault ID and revision are authenticated. Plain SQLite and attachments are in memory while unlocked. Passphrases are not stored. This is authenticated SQLite snapshot encryption, not SQLCipher.

Passphrase rotation derives a new salt/key, re-encrypts the current database, saves with revision checking, then swaps the active key. If saving fails, the old key/envelope remain active. Old backups keep their original encryption keys/passphrases. Exports are plaintext PDF/CSV by design.

## Local adapter

Browser IndexedDB writes current/recovery snapshots atomically with an expected revision check. Daily snapshots keep seven dates. The retained Tauri adapter handles native encrypted files; its platform behavior has not been reverified in this session.

## Cloud adapter

Supabase JS manages account sessions and password authentication. The account password and workspace encryption passphrase are independent. One `propertyos_vaults` row belongs to each `auth.users` ID. The frontend sends ciphertext envelopes, not plaintext SQL/profile records. Per-account cache databases are scoped by Supabase hostname and owner ID.

RLS permits owners to select only their row/snapshots. Direct client writes are revoked. The `propertyos_save` security-definer function derives the owner from `auth.uid()` rather than accepting an owner ID. A per-owner transaction advisory lock and row lock enforce atomic expected revision checks, including first inserts. Prior content becomes the recovery snapshot. The `propertyos_checkpoint` function accepts only a snapshot identical to the current owner envelope and retains 14 daily snapshots plus recovery/pre-restore keys. Functions use an empty search path and explicit qualified names.

Cloud saves commit remotely first. A failed local cache refresh cannot turn a confirmed cloud save into a reported rollback. Offline cached workspaces are read-only. Only network-unavailable read failures may fall back to cache; authentication/permission errors do not. Stale edits are cancelled; users reopen to fetch newer records. There is no live merge or staff sharing.

## Hosting and size

Vercel serves the static `dist` build. No business data is written to its filesystem and no service-role credential appears in browser source. Service-worker assets are cached from the same origin; Supabase requests are not cached by the worker. Cloud whole-database envelopes are limited to 64 MB. Memory, encryption, network and snapshot storage grow with data/attachment size, so very large portfolios need another persistence design and load testing.
