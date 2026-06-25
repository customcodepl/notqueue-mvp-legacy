# NotQueue — pierwsze wdrożenie (Cloudflare Workers)

Źródła: `context/foundation/infrastructure.md`, `context/foundation/tech-stack.md` (`deployment_target: cloudflare-pages`, `ci_default_flow: auto-deploy-on-merge`).

**Zasada:** produkcja deployowana przez **Cloudflare Workers Builds** (Git → build → `wrangler deploy`). GitHub Actions = tylko lint + build (bramka jakości), bez deployu.

---

## Faza 0 — Przygotowanie repo (agent / dev)

- [x] `wrangler.jsonc`: nazwa `not-queue`, flaga `disable_nodejs_process_v2`
- [x] Skrypt `npm run deploy` → `astro build && wrangler deploy`
- [x] Lokalny build OK: `SUPABASE_URL=… SUPABASE_KEY=… npm run build`
- [x] Pierwszy deploy z maszyny: `npm run deploy` (konto `customcode`)
- [x] Sekrety produkcyjne: `npx wrangler secret bulk .dev.vars`
- [x] URL produkcyjny: https://notqueue.notqueue.workers.dev

## Faza 1 — Konto Cloudflare i Supabase

- [x] Konto Cloudflare + Wrangler OAuth (`customcode`)
- [x] `.dev.vars` z `SUPABASE_URL` / `SUPABASE_KEY`

## Faza 2 — Workers Builds (auto-deploy z `main`)

W dashboardzie: **Workers & Pages → Create application → Import a repository**.

| Ustawienie | Wartość |
|---|---|
| Production branch | `main` (zgodnie z `.github/workflows/ci.yml`) |
| Build command | `npm ci && npx astro sync && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node.js version | 22 |

**Zmienne środowiskowe w Cloudflare** (Settings → Variables and Secrets, Production):

| Nazwa | Typ | Uwagi |
|---|---|---|
| `SUPABASE_URL` | Secret lub Variable | URL projektu Supabase |
| `SUPABASE_KEY` | Secret | klucz `anon` (nie service_role w Workerze SSR bez dodatkowej ochrony) |

Te same nazwy co w `astro.config.mjs` (`astro:env/server`). Nie używaj `import.meta.env` dla sekretów SSR.

- [ ] Repozytorium GitHub połączone z Cloudflare
- [ ] Pierwszy deploy zakończony sukcesem
- [ ] URL `*.workers.dev` działa (sign-in, dashboard)

## Faza 3 — Weryfikacja po deployu

- [ ] `/auth/signin` — logowanie staff
- [ ] `/dashboard` — redirect gdy brak sesji
- [ ] `npx wrangler tail` — brak błędów SSR przy pierwszym wejściu
- [ ] (Później) Supabase Realtime dla gości — osobna implementacja produktu

## Faza 4 — Operacje (MVP)

| Akcja | Jak |
|---|---|
| Rollback | `npx wrangler deployments list` → `npx wrangler rollback <id>` |
| Logi | `npx wrangler tail` lub Observability w dashboardzie |
| Rotacja sekretów | Dashboard lub `wrangler secret put` + redeploy |
| Preview PR | Workers Builds — preview deployments (opcjonalnie Cloudflare Access) |

## Poza zakresem tego planu

- GitHub Actions deploy workflow (świadomie pominięty)
- Docker / multi-region / staging env (`CLOUDFLARE_ENV` — dopiero przy drugim środowisku)
