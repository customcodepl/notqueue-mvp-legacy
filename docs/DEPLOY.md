# Deploy NotQueue to Cloudflare Workers

Production deploys use **Cloudflare Workers Builds** (Git integration), not GitHub Actions deploy. CI in `.github/workflows/ci.yml` only runs lint and build.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Cloudflare account
- Supabase project URL and anon key

## Local

```bash
npm ci
cp .env.example .dev.vars
# Edit .dev.vars: SUPABASE_URL, SUPABASE_KEY
npm run dev
```

## Manual deploy (first time or hotfix)

```bash
npx wrangler login
npm run deploy
```

Set Worker secrets if not using dashboard variables:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

## Auto-deploy on merge to `master`

1. Open [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create application** → **Import a repository**.
2. Select this GitHub repo.
3. Configure:

   - **Production branch:** `master`
   - **Build command:** `npm ci && npx astro sync && npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Node.js:** 22

4. Add **Variables and Secrets** for production:

   - `SUPABASE_URL`
   - `SUPABASE_KEY`

5. Save and deploy. The app is served at `https://not-queue.<account>.workers.dev` (see dashboard for exact URL).

## Troubleshooting

- Blank or broken HTML in production: ensure `disable_nodejs_process_v2` is in `wrangler.jsonc` (see `context/foundation/infrastructure.md` risk register).
- Auth works locally but not in prod: secrets must be set in Cloudflare, not only in `.dev.vars`.
- Build fails in CI or Cloudflare: add repository secrets / dashboard vars for `SUPABASE_URL` and `SUPABASE_KEY`.

See also @README.md (Supabase setup) and `context/changes/deployment/deployment-plan.md`.
