---
bootstrapped_at: 2026-05-30T17:19:40Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: not-queue
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: not-queue
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: false
  has_background_jobs: false
```

NotQueue is a solo, after-hours web MVP (3 weeks) needing staff auth, tokenized guest pages, and live queue updates. The recommended JS default — 10x Astro Starter — ships TypeScript, Supabase (PostgreSQL, staff auth, realtime subscriptions for guest status), and Cloudflare Pages deploy in one opinionated stack, matching the PRD's auth and live-update signals without assembling pieces manually. Cloudflare Pages plus GitHub Actions with auto-deploy-on-merge follow the starter's defaults. SMS notifications (FR-014, nice-to-have) remain a downstream add-on; payments and AI are out of scope per the PRD.

## Pre-scaffold verification

| Signal             | Value                                              | Severity | Notes                                      |
| ------------------ | -------------------------------------------------- | -------- | ------------------------------------------ |
| npm package        | not run                                            | —        | cmd_template uses git clone, not npm create |
| GitHub repo        | przeprogramowani/10x-astro-starter pushed 2026-05-17 | fresh    | via card docs_url; gh CLI unavailable, used GitHub API |

Recency: `przeprogramowani/10x-astro-starter` last pushed 2026-05-17 (fresh). Proceeding.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: full starter tree (root config, `src/`, `supabase/`, `public/`, `node_modules/`, etc.)

**Conflicts (.scaffold siblings)**: none

**.gitignore handling**: moved silently

**.bootstrap-scaffold cleanup**: deleted (upstream `.git/` removed before move-up)

`context/` in cwd preserved verbatim (PRD, shape-notes, tech-stack hand-off untouched).

## Post-scaffold audit

**Tool**: npm audit --json

**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW

**Direct vs transitive**: 0 direct CRITICAL/HIGH; 1 HIGH transitive (`devalue`); 1 direct MODERATE (`@astrojs/check`)

#### CRITICAL findings

(none)

#### HIGH findings

- **devalue** (transitive) — GHSA-77vg-94rm-hx3p: Svelte devalue DoS via sparse array deserialization (CVSS 7.5). Fix may require upstream dependency updates.

#### MODERATE findings

- **@astrojs/check** (direct) — via `@astrojs/language-server` → `volar-service-yaml` → `yaml-language-server` → `yaml` advisory chain. Fix available: downgrade to `@astrojs/check@0.9.2` (semver major).
- **8 additional moderate** transitive advisories in Cloudflare/vite/ws/yaml toolchain (see `npm audit` full report).

#### LOW / INFO findings

(none)

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | true                               |
| has_ai                     | false                              |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
- Copy `.env.example` to `.env` and configure Supabase credentials before running locally.
