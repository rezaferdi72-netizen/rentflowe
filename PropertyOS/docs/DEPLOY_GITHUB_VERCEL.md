# Publish PropertyOS through GitHub and Vercel

The source is a Vite React/TypeScript application. GitHub holds your code; Vercel serves the app. For the same business records on your phone and computer, Supabase supplies sign-in and durable encrypted cloud records. Local mode works without Supabase.

No account credentials, real business records or secret keys are included in this package.

## 1. Put the source in GitHub

1. Extract the ZIP. Open the `PropertyOS` folder.
2. Create a GitHub repository, for example `propertyos`. A private repository is suitable for your business source.
3. Upload the **contents** of the folder, including `src`, `public`, `supabase`, `scripts`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vercel.json` and `.github/workflows/ci.yml`.
4. Commit the files. Do not upload `node_modules`, `.env.local`, downloaded backups or your real records.

If using the command line inside `PropertyOS`:

```sh
git init
git add .
git commit -m "Add PropertyOS business app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/propertyos.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username. The `.gitignore` excludes build output, dependencies, credentials and backups. If you uploaded a top-level `PropertyOS` folder instead of its contents, choose `PropertyOS` as Vercel's Root Directory in step 3.

## 2. Create cloud storage and the owner login

Skip this section if you want a workspace that stays in one browser.

1. Create a project in your own Supabase account. Keep its database password in your password manager.
2. Open the project's SQL Editor. Paste and run the complete contents of `supabase/schema.sql`.
3. Confirm that `propertyos_vaults` and `propertyos_snapshots` exist and have row-level security enabled. The script creates the policies, permission grants and revision-checked write functions; do not replace them with unrestricted policies.
4. In Authentication, enable email/password sign-in. In the Users area, create your owner account with your email and a strong account password. Confirm the account as appropriate for your project configuration.
5. Disable public new-user signups if this deployment is only for your business. There is no public signup button in PropertyOS.
6. Copy the Project URL and **publishable key** from the project's API settings/Connect information. A legacy `anon` key also works. Never use a `service_role`, `sb_secret_...` key or database password in a browser variable.

Each account gets its own independent workspace. This is not a staff invitation system: additional accounts do not share your records. The owner's account password authenticates to Supabase. A separate PropertyOS workspace passphrase encrypts the records. Resetting the account password does not reset a forgotten encryption passphrase.

## 3. Import the repository into Vercel

1. In Vercel, create a new project and import the GitHub repository.
2. Choose the directory containing `package.json` as Root Directory.
3. Confirm the settings below. The included `vercel.json` already supplies the framework, install/build commands, output directory and routing.

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | 22 or newer |

4. For cloud mode add these environment variables in the Vercel project before deploying:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your project's HTTPS URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your publishable API key |

Use `VITE_SUPABASE_ANON_KEY` instead of the second variable only when using a legacy anon key. These public values become part of the browser build; authorization comes from authenticated sessions and database policies.

5. Deploy. If you add or change the environment variables afterward, redeploy; Vite reads them at build time. Without both variables, the app opens in local mode.

Use a separate Supabase project for Preview if previews should not read/write live business records. Otherwise your configured preview and production builds can reach the same owner workspace.

## 4. Finish authentication URLs

After Vercel returns your app URL:

1. In Supabase Authentication → URL Configuration, set the Site URL to the exact production HTTPS app URL.
2. Add the production URL to permitted redirect URLs, and add a local development URL only if needed.
3. Configure your own supported email/SMTP delivery if you need dependable account password-reset emails. The app contains the reset request and password-update screens; email delivery is controlled by your Supabase project.

The public app shell and source assets can be downloaded. Private records remain encrypted and account-scoped. A public Vercel URL is not itself a record-sharing link.

## 5. Open your business workspace

1. Open the deployed URL. For cloud mode, sign in with the owner email and account password.
2. If starting fresh, enter your business name and choose a long workspace passphrase.
3. If moving an existing PropertyOS workspace, export its encrypted `.posvault` backup first. On the empty cloud workspace unlock screen, expand **Already have a PropertyOS backup?**, select the file and its passphrase, and choose Import workspace. Then unlock with that passphrase.
4. Enter the business logo/address/contact details in Settings.
5. Add or import properties, tenants, units and leases. The CSV importer validates the whole file before any records are saved.
   Keep phone/ID columns as text in Excel to preserve leading zeros. Use the
   provided module template for imports; exported tables include extra history
   and identifiers and are not direct re-import templates.
6. Record an opening cash balance or owner contribution once, then begin billing and recording payments.

Never create a new blank workspace over existing records. Existing cloud records are loaded automatically for the same owner account.

## 6. Check the live deployment once

These deployment checks are still yours to run, because this package was created without your account credentials:

- Create a test property, unit, tenant and lease; issue one invoice and record a partial payment.
- Refresh/reopen and confirm the remaining balance.
- Sign in on another device, use the same workspace passphrase and confirm the records are present.
- Keep two devices open: save on one, then attempt a stale edit on the other. The stale edit should be cancelled; lock and reopen to load the latest records.
- Export an encrypted backup and confirm it can be imported into a separate local test workspace.
- If email delivery is configured, test resetting the account password and verify that the workspace still requires its original passphrase.

After installation, local mode supports offline editing. Cloud mode supports cached offline viewing and rejects writes without internet. It does not merge records, send SMS/email to tenants, connect to bank accounts or run billing while closed.

## Updating the app

Push code changes to the connected GitHub branch. Vercel creates the next deployment from that source. Browser-local records belong to the exact domain and browser profile; moving domains requires a backup/restore. Cloud records remain under the same configured Supabase project and owner account. Lock/reopen after an update when needed.

PropertyOS 0.1 backup/database schema is migrated additively to version 2. Retain an external backup before upgrading. Codes 1510, 4030 and 5200 are reserved for the added investment accounts; a legacy custom account with those codes makes migration fail safely rather than overwrite it.

## Common problems

| Symptom | Check |
| --- | --- |
| Local screen appears instead of cloud sign-in | Both Vercel variables must be present before a fresh deployment. Choose Open cloud sign-in if local mode was selected previously. |
| Cloud setup incomplete | Run the entire `supabase/schema.sql` in the same project named by the URL. |
| Invalid login credentials | Confirm the owner account/password and email confirmation status. Use account reset if email delivery is configured. |
| Incorrect passphrase | Use the workspace/backup encryption passphrase, not the account password. A lost encryption passphrase cannot be reset. |
| Another device changed the workspace | The attempted change was cancelled. Lock/reopen to fetch the latest saved records, then retry. |
| Offline read-only message | Reconnect and reopen. Use an independent local workspace for offline editing. |
| SQLite/font assets fail to load | Check that `public` was uploaded and the Vercel output is `dist`; do not deploy only `index.html`. |
| Build cannot find package files | Set Root Directory to the folder containing `package.json` and keep `package-lock.json`. |

## Primary documentation

- Vite on Vercel: https://vercel.com/docs/frameworks/frontend/vite
- Git deployments: https://vercel.com/docs/git
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase password authentication: https://supabase.com/docs/guides/auth/passwords
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase functions: https://supabase.com/docs/guides/database/functions
