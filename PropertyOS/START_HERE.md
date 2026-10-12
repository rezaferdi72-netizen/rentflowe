# Start here — PropertyOS

Your full source is in this `PropertyOS` folder. Do not upload the ZIP itself as app source.

## Publish your app

1. Extract the ZIP and upload the contents of the `PropertyOS` folder to your GitHub repository.
2. For cloud records across devices, create a Supabase project, run `supabase/schema.sql` and create your owner login account.
3. Import the repository into Vercel. Build: `npm run build`. Output: `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to Vercel before deploying. These are public client configuration, not server-secret keys.
5. Open the deployed app, sign in, then create your workspace with a separate passphrase of at least 12 characters.

Follow the exact steps in [docs/DEPLOY_GITHUB_VERCEL.md](docs/DEPLOY_GITHUB_VERCEL.md).

For a local offline workspace, leave the cloud variables blank and run `node scripts/serve.mjs`; open http://127.0.0.1:4173.

After opening: Settings → Properties → Units → Tenants → Leases → Rent & collections. Investment holdings and Owners & capital support your other business funds. Database & backup contains CSV import and encrypted backups.

The app and database calculations were built and tested. Your live GitHub/Vercel/Supabase accounts have not been configured or deployed by this package.
