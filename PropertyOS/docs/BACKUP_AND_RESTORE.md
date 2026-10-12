# Backups, restore and device transfer

Database & backup → Create encrypted backup downloads the entire saved database, attachments, audit/history and document versions as `.posvault`. The file needs its workspace passphrase. Keep external backups and passphrases separately. A service worker caches the app, not your records. PDF/CSV exports are plaintext and are not substitutes for database backups.

## Restore

Export the current workspace first. Select the backup, enter its passphrase, type `RESTORE` and choose Verify and restore. The candidate is decrypted and checked for SQLite integrity, foreign keys, supported schema, invoice totals and balanced journals. Version 1 is upgraded to version 2. The existing revision must still match before the verified replacement is saved. A pre-restore copy is preserved. Restore replaces the whole workspace and does not merge records. After restore, use the imported backup's passphrase.

On an empty workspace screen, expand Already have a PropertyOS backup? to import instead of creating a blank workspace.

## Storage modes

Local-to-local import makes independent copies. Later edits do not synchronize. For a local-to-cloud move, export the local backup and import it into an empty cloud workspace after signing in. Verify the cloud records on another device before retiring the local copy. If the cloud workspace already has records, compare/export both before explicitly restoring one over the other.

A cloud account opens its latest saved encrypted workspace on every unlock. Edits require internet; offline viewing uses a previously cached encrypted copy. A stale revision is rejected. Lock/reopen instead of copying an old snapshot over newer records.

## Automatic history

- Previous-save recovery is retained after a saved change and can be exported using the recovery button.
- Browser-local daily history keeps seven snapshots. Cloud daily history keeps 14. Select Load backup history to download a dated snapshot. Snapshots are created while the app is open, not by a closed-app background scheduler.
- A pre-restore safety copy is also retained. The dedicated pre-restore export UI is not included.
- Native Tauri source keeps dated local files but does not implement automatic pruning or the snapshot selector API.

Cloud history remains in the same provider account and local history remains on the same device. Export independent backups as well.

## Passphrase changes

Database & backup → Change workspace passphrase re-encrypts the current workspace after the matching new passphrases are validated. Create a new external backup immediately. Previously exported/daily/recovery backups still require their old passphrase. Account password reset cannot recover a forgotten workspace passphrase.

## Errors

A failed ordinary save restores the last committed in-memory database. Do not clear browser site storage as the first troubleshooting step. Keep the same domain/port/browser profile for local data. A cloud save confirmed by the server stays committed even if updating the encrypted device cache fails; the connection indicator reports the cache warning.

Verify backups in an independent test workspace: check an invoice, its receipts, tenant closing balance, trial balance, investment holding and attached document before relying on a recovery procedure.
