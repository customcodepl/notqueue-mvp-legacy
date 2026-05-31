# Rules for AI

Canonical rules for this repository. Agent onboarding distillation: @AGENTS.md.

## Hard rules

- API routes must export `const prerender = false` (SSR default: `output: "server"` in @astro.config.mjs).
- API routes: uppercase `GET`, `POST` exports; validate input with zod.
- Path alias `@/*` → `./src/*` per @tsconfig.json.
- Astro components for static content/layout; React only when interactivity is needed.
- Tailwind: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings manually.
- shadcn/ui: `src/components/ui/`, "new-york" variant; add with `npx shadcn@latest add [name]`.
- Supabase migrations: `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`; enable RLS with granular per-operation, per-role policies.
- React: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- Services/helpers in `src/lib/` or `src/lib/services/`; shared types (entities, DTOs) in `src/types.ts`.
- Never commit secrets; `SUPABASE_URL` and `SUPABASE_KEY` are server-only via @astro.config.mjs `env.schema`.
- Husky pre-commit: `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`.

## Commands

Scripts: @package.json. CI also runs `npx astro sync` before lint — see @.github/workflows/ci.yml.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui. Deployed to Cloudflare Workers.

### Auth flow

- `src/lib/supabase.ts` — Supabase SSR client (`@supabase/ssr`), cookie sessions, `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY`.
- `src/middleware.ts` — resolves user to `context.locals.user`; redirects unauthenticated users on `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

## Environment

Node.js v22.14.0 (@.nvmrc). Env files, local Supabase, Cloudflare secrets, deploy: @README.md.

## CI

@.github/workflows/ci.yml — lint + build on push/PR to `master`; requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
