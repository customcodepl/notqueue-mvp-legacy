---
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
---

## Why this stack

NotQueue is a solo, after-hours web MVP (3 weeks) needing staff auth, tokenized guest pages, and live queue updates. The recommended JS default — 10x Astro Starter — ships TypeScript, Supabase (PostgreSQL, staff auth, realtime subscriptions for guest status), and Cloudflare Pages deploy in one opinionated stack, matching the PRD's auth and live-update signals without assembling pieces manually. Cloudflare Pages plus GitHub Actions with auto-deploy-on-merge follow the starter's defaults. SMS notifications (FR-014, nice-to-have) remain a downstream add-on; payments and AI are out of scope per the PRD.
