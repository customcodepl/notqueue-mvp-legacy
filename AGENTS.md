# Repository Guidelines

Astro 6 SSR app on Cloudflare Workers with React 19 islands, Tailwind 4, and Supabase cookie auth. Auth, SSR, env, and conventions: @CLAUDE.md. Setup and deployment: @README.md. This file is the agent onboarding distillation.

## Hard Rules

- API routes under `src/pages/api/` must export `const prerender = false`, use uppercase `GET`/`POST` handlers, and validate request bodies with zod.
- Do not add Next.js directives (`"use client"`, etc.) to React files; put hooks in `src/components/hooks/`.
- Merge Tailwind classes with `cn()` from `@/lib/utils` — never concatenate class strings manually.
- New Supabase migrations go in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql` with RLS enabled and granular per-operation policies.
- Never commit secrets; use `.env` (Node) or `.dev.vars` (Cloudflare local). Copy from @.env.example.
- Husky pre-commit runs `eslint --fix` on `*.{ts,tsx,astro}` and Prettier on `*.{json,css,md}` — match that before pushing.

## Project Structure

- `src/pages/` — Astro routes; `src/pages/api/` — endpoints
- `src/components/` — Astro layouts and React UI (`src/components/ui/` for shadcn)
- `src/lib/` — Supabase client, helpers, services; `src/middleware.ts` — auth gate (`PROTECTED_ROUTES`)
- `src/types.ts` — shared entity/DTO types
- `context/` — product/foundation docs from 10x workflow
- Deploy config: @wrangler.jsonc, @astro.config.mjs

Import via `@/*` → `./src/*` per @tsconfig.json.

## Build, Test, and Development

- `npm run dev` — local dev (Cloudflare workerd runtime)
- `npm run build` / `npm run preview` — production build and preview
- `npm run lint` / `npm run lint:fix` / `npm run format` — ESLint (type-checked) and Prettier
- `npx astro sync` — regenerate Astro types (CI runs this before lint)
- `npm run deploy` — build + `wrangler deploy`; prod: https://notqueue.notqueue.workers.dev; auto-deploy on `main` via Workers Builds — @docs/DEPLOY.md

Node **v22.14.0** per @.nvmrc. No automated test suite in-repo; verify with lint + build.

## Coding Style

- shadcn/ui: add components with `npx shadcn@latest add [name]` into `src/components/ui/`.
- Enforced by @eslint.config.js and @.prettierrc.json (strict TypeScript, Astro, React, a11y).

## Pull Requests & CI

CI gate: @.github/workflows/ci.yml. Before opening a PR, run `npm run lint` and `npm run build` locally (with `SUPABASE_URL` and `SUPABASE_KEY` set).
