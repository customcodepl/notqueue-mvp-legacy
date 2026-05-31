---
project: not-queue
researched_at: 2026-05-31
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR)
  runtime: Cloudflare Workers (workerd via @astrojs/cloudflare ^13.5)
---

## Recommendation

**Deploy on Cloudflare Workers.**

NotQueue already ships with `@astrojs/cloudflare`, `wrangler.jsonc`, and `deployment_target: cloudflare-pages` in @context/foundation/tech-stack.md. For a cost-minimized MVP with Supabase as an external provider, Cloudflare’s free tier (100k Worker requests/day, unlimited static asset egress) beats container PaaS minimums (Railway $5/mo, Render $7/mo/service) and avoids swapping adapters. Guest live updates run over **Supabase Realtime in the browser** — not long-lived Workers WebSockets — so interview Q1 (“don’t know”) does not block this choice; document Workers WebSockets only if you later move realtime to the edge.

Interview weights applied: minimize cost (favor CF free tier), single region (edge less critical), external DB OK (Supabase), AWS/Azure familiarity noted as ops comfort but not a fit without replacing the Cloudflare adapter and adding container/Lambda ops.

## Platform Comparison

Hard filter note: Q1 = don’t know → no platform dropped for WebSockets. All six candidates support Astro SSR **only after the correct adapter** (`@astrojs/cloudflare`, `@astrojs/vercel`, `@astrojs/netlify`, or `@astrojs/node` for Fly/Railway/Render).

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total (P=2, Part=1) |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass (`llms.txt`) | Pass (`wrangler deploy`) | Pass (official MCP) | **10** |
| Netlify | Pass | Pass | Partial | Pass | Pass (Netlify MCP) | 9 |
| Vercel | Pass | Pass | Pass | Pass | Partial (Vercel MCP, beta) | 9 |
| Fly.io | Pass | Pass | Pass | Pass | Partial | 9 |
| Render | Pass | Pass | Partial | Pass | Partial | 9 |
| Railway | Pass | Pass | Partial | Pass | Partial | 9 |

Cost penalty (Q2): Railway Hobby **$5/mo minimum**; Render paid web service **from $7/mo**; Vercel Hobby **$0** but **non-commercial** — NotQueue is a commercial restaurant product → plan for **Pro $20/mo** if you choose Vercel. Cloudflare and Netlify free tiers remain viable at low traffic.

AWS/Azure (interview Q3): viable with ECS/Lambda/App Service + `@astrojs/node`, but **not** aligned with the locked starter; higher setup and agent-ops surface for MVP.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

First-class Astro 6 path: `astro dev` on workerd, `main: "@astrojs/cloudflare/entrypoints/server"` in @wrangler.jsonc, deploy via `npx wrangler deploy`. Matches GitHub Actions CI and Supabase SSR cookie auth already in repo. Free tier covers early restaurant traffic; paid Workers from **$5/mo** account minimum only if you exceed free quotas.

#### 2. Netlify (Runner-up)

`npx astro add netlify` + credit-based free plan (300 credits/mo). Unlimited preview deploys (0 credits). Requires adapter swap and re-validating Supabase env access patterns; good if you want dashboard-first previews without Cloudflare account lock-in.

#### 3. Vercel

`@astrojs/vercel` is mature and CLI-friendly. Hobby free tier is **personal/non-commercial**; commercial MVP implies **Pro ~$20/user/mo**. Strong if team standardizes on Vercel, weaker on cost and starter alignment.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Node compat traps** — `@astrojs/cloudflare` + `nodejs_compat` can break SSR (empty/HTML garbage responses) if `disable_nodejs_process_v2` is missing; production debugging is runtime-specific, not generic Node.
2. **Multi-environment builds** — Astro 6 + Cloudflare Vite plugin requires `CLOUDFLARE_ENV=<env> astro build` per environment; `wrangler deploy --env` alone does not apply env-specific `wrangler.jsonc` blocks (GitHub issue #15917).
3. **Secrets at build vs runtime** — Dashboard secrets are not available at Vite build time; server secrets must use `astro:env/server` or `cloudflare:workers` `env`, not `import.meta.env` for SSR (bakes `undefined`).
4. **Vendor concentration** — App + CDN + compute on one vendor; migrating off Workers means adapter and routing rewrite.
5. **Supabase latency** — SSR on edge calls Supabase over the public internet unless you add Hyperdrive; fine for MVP, worth watching under load.

### Pre-Mortem — How This Could Fail

The team shipped NotQueue on Cloudflare Workers with Supabase Realtime. For the first month it worked. Then they added staging/prod Workers environments without separate `CLOUDFLARE_ENV` builds — staging pointed at production KV routes. A guest-facing deploy used `import.meta.env.SUPABASE_KEY` in an API route; Vite inlined `undefined`, staff auth worked locally but guests saw 500s in prod. When traffic spiked on a Friday night, they hit the 100k/day free request cap during a viral post; rollback via `wrangler rollback` fixed code but not the quota clock. Six months in, they wanted AWS ALB + RDS for “enterprise” and discovered every Astro page assumed `Astro.locals.runtime` removed in Astro 6 — the migration doc they skipped became a two-week rewrite. The incorrect assumption was “Cloudflare is free forever at any scale” and “the starter adapter handles env like Node.”

### Unknown Unknowns

- **`disable_nodejs_process_v2`** may be required in `wrangler.jsonc` alongside `nodejs_compat` for correct Astro 6 SSR bodies (community reports, May 2026).
- **Preview URLs** on Workers/Pages may need Cloudflare Access or similar if you expose staging with production-like data.
- **Commercial SMS webhooks** (FR-014 nice-to-have) add outbound fetch + provider secrets — still fine on Workers, but not in starter scope.
- **Supabase Realtime** uses browser WebSockets to Supabase, not Workers; do not conflate with Q1 server-side persistence.
- **Wrangler ^4.90** + Astro 6: local fidelity is `npm run dev` (workerd), not a separate legacy `wrangler dev` for the app shell.

## Operational Story

- **Preview deploys**: Connect GitHub repo in Cloudflare dashboard (Workers & Pages) → automatic preview URLs per branch/PR; fork PRs may need workflow tokens. Protect previews with Cloudflare Access if staging uses real Supabase data. GitHub Actions in @.github/workflows/ci.yml validates build only — wire deploy workflow separately when implementing.
- **Secrets**: Production/staging secrets in Cloudflare dashboard or `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY`; mirror for CI in GitHub repository secrets (already required for build). Local: `.dev.vars` (gitignored). Rotation: update dashboard + `wrangler secret put`, redeploy.
- **Rollback**: `npx wrangler deployments list` then `npx wrangler rollback [deployment-id]` — typically minutes; does not revert Supabase migrations.
- **Approval**: Human approves production deploy and secret rotation; agent may run `npm run lint`, `npm run build`, and preview deploys on non-prod branches if CI tokens are scoped.
- **Logs**: `npx wrangler tail` for live Worker logs; dashboard Observability (enabled in @wrangler.jsonc); GitHub Actions logs for CI. Cloudflare MCP (`https://mcp.cloudflare.com/mcp`) for account/docs tooling in supported clients.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| SSR serves blank/garbled HTML on Workers | Unknown unknowns / Research | M | H | Keep `nodejs_compat`; add `disable_nodejs_process_v2` if repro; verify with `npm run build && npm run preview` |
| Wrong env deployed (staging/prod) | Devil's advocate | M | H | Build per env: `CLOUDFLARE_ENV=staging npm run build && npx wrangler deploy` |
| Secrets baked as `undefined` in SSR | Unknown unknowns | M | H | Use `astro:env/server` only (@astro.config.mjs schema); never `import.meta.env` for server secrets |
| Free tier 100k requests/day exceeded | Devil's advocate | L | M | Monitor Cloudflare analytics; upgrade to Workers Paid ($5/mo base) before launch week |
| Vendor lock-in on Cloudflare adapter | Devil's advocate | M | M | Keep Supabase portable; document adapter swap path (Netlify/Vercel) in runner-up plan |
| Q1 realtime ambiguity | Interview | M | L | Keep guest updates on Supabase Realtime client-side; revisit Workers WebSockets only if product requires server-push without Supabase |

## Getting Started

1. `npm ci` and copy secrets: `cp .env.example .dev.vars` — set `SUPABASE_URL`, `SUPABASE_KEY` (see @README.md).
2. Local dev (workerd): `npm run dev` — no separate platform dev server needed with Astro 6 + @astrojs/cloudflare.
3. Production build + deploy: `npm run build` then `npx wrangler deploy` (uses @wrangler.jsonc entrypoint `@astrojs/cloudflare/entrypoints/server`).
4. Cloudflare secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
5. Connect GitHub repo in Cloudflare for preview/production deploys; keep @.github/workflows/ci.yml lint/build gate on `master`.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (beyond noting existing GitHub Actions build gate)
- Production-scale architecture (multi-region HA, DR, enterprise SLAs)
