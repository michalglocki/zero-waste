---
project: zero-waste
researched_at: 2026-08-31
recommended_platform: Cloudflare Workers (+ Pages)
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Expo SDK 56 (React Native, expo-router)
  runtime: EAS Build/Submit for binaries; Workers (workerd) for optional BFF/API
---

## Recommendation

**Deploy on Cloudflare Workers (+ Pages) for any thin request/response API or BFF; ship the mobile app via EAS (already locked in tech-stack.md).**

Zero waste is an Expo SDK 56 household-inventory MVP: binaries go to the stores through EAS, auth/data can live on an external provider (e.g. Supabase), and interview answers ruled out persistent connections, preferred single-region, and accepted external services. Cloudflare scored 5/5 on agent-friendly criteria (CLI-first wrangler, managed serverless, llms.txt docs, stable deploy/rollback API, MCP surface) with a free tier that covers 10k–100k monthly requests. Railway is the runner-up when a conventional always-on Node process is preferable later.

Default MVP shape: **Expo app → Supabase (auth + Postgres + RLS) directly.** Add a Worker only when you need a BFF (secrets, barcode enrichment, aggregation). Do not host the React Native binary on Cloudflare.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers + Pages | Pass | Pass | Pass | Pass | Pass | 5 |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP public beta) | 4P+1∂ |
| Netlify | Partial (rollback via API/UI) | Pass | Pass | Pass | Pass | 4P+1∂ |
| Fly.io | Pass | Pass | Pass | Pass | Partial (partial MCP) | 4P+1∂ |
| Railway | Partial (no CLI rollback) | Pass | Pass | Pass | Pass | 4P+1∂ |
| Render | Partial (no CLI rollback) | Pass | Pass | Pass | Pass | 4P+1∂ |

Hard filters: none dropped (stateless request/response; all support JS/TS). Soft weights: cost ≈ DX, single region, external providers OK → favor low-ops free/cheap tiers over always-on containers; co-location not required.

**Cloudflare** — Wrangler deploy/rollback/tail; Free 100k req/day; Paid from $5/mo; JS/TS GA; WebSockets via Durable Objects if ever needed (not required now); D1/KV/R2/Queues available but optional given external Supabase.

**Vercel** — Strong CLI and docs; Hobby free but non-commercial; commercial MVP ≈ Pro $20/mo; Edge Functions deprecated; WebSockets public beta; marketplace storage (Neon/Supabase) fits external-provider preference but cost is higher for a thin mobile API.

**Netlify** — Functions + Edge GA; official MCP; credit-based free tier can cover light API traffic; rollback not a first-class CLI verb; Identity story has churned historically.

**Fly.io** — Full container/Node, WebSockets GA; no permanent free tier for new orgs; pay-as-you-go tiny Machine ~$2–6/mo; overkill for a stateless BFF beside Supabase.

**Railway** — Railpack Node/TS GA, WebSockets yes, Hobby $5, hosted MCP GA; unmanaged DB templates; CLI lacks arbitrary rollback (dashboard). Best conventional-Node alternative.

**Render** — Node/Bun GA, WebSockets on paid always-on; free tier cold-starts hurt mobile UX; Starter ~$7/mo; Object Storage alpha; CLI lacks rollback command.

### Shortlisted Platforms

#### 1. Cloudflare Workers (+ Pages) (Recommended)

Won on criteria score, free-tier headroom for household-scale traffic, and agent operability (`wrangler deploy` / `rollback` / `tail`). Matches “external providers fine”: keep Postgres/auth on Supabase; use Workers only as optional edge glue. Single-region preference does not hurt — Workers still work; you simply do not need multi-region as a selling point.

#### 2. Railway

Second for DX when you want a long-running Node/Express (or Bun Functions) API instead of the Workers runtime. Strong MCP and docs; Hobby pricing is predictable. Gap vs Cloudflare: weaker CLI rollback, always-on idle cost unless Serverless sleep is enabled, and more ops surface than needed for a thin BFF.

#### 3. Render

Third as a free→Starter path for a small always-on Node API with llms.txt and hosted MCP. Gap vs Cloudflare: cold starts on free tier, no CLI rollback, and higher baseline cost once always-on is required.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Workers ≠ Node.** Expo/Supabase tutorials assume Node/Express; Workers’ fetch-based runtime and limited Node compat break libraries that need full Node APIs or native bindings.
2. **EAS is still the real ship path.** Cloudflare does not deliver iOS/Android binaries — without a crisp “thin BFF vs call Supabase directly” decision, teams build an unnecessary middle tier.
3. **Free-tier CPU ceiling (10 ms).** Heavy crypto, image work, or chatty multi-round DB logic can trip free limits; Paid is only $5/mo but the failure mode is intermittent 1102s, not a clear bill.
4. **Hyperdrive / D1 / R2 tempt lock-in.** Easy to start “just Workers” and pull data onto Cloudflare when the plan was external Supabase — split-brain auth/session bugs follow.
5. **Local mobile debugging.** Phone → `localhost` Worker does not work; need deploy, tunnel, or LAN setup — slower than a local Express + Expo loop.

### Pre-Mortem — How This Could Fail

The team treated Cloudflare as “the backend” and put household inventory mutations behind Workers while also using Supabase Auth and RLS. Six months in, client tokens, Worker secrets, and RLS policies drifted: some routes trusted the Worker service role and bypassed household membership checks. A library that “worked in Node” broke under Workers after a dependency bump; hotfix required rewriting the BFF. Meanwhile EAS Submit and store review ate the calendar, so the Worker layer sat half-tested. Free-plan CPU spikes during barcode-enrichment caused intermittent failures in the aisle. The team concluded Workers was the wrong abstraction and migrated to direct Supabase from the app — rewriting the BFF and burning the MVP buffer.

### Unknown Unknowns

- **You may not need a PaaS BFF for MVP** — Expo + Supabase client + RLS often covers auth and stock CRUD; Cloudflare is optional glue, not the host for the product.
- **EAS Hosting is Cloudflare Workers under the hood** — For Expo Router `+api` / `expo-server` (SDK 54+; this project is SDK 56), `eas deploy` can host API routes on a managed Workers runtime. Prefer that path if the only need is Expo API routes without custom Cloudflare bindings; use your own Wrangler project when you need KV/D1/R2/Hyperdrive bindings or account-level control. Adapter: `expo-server/adapter/workerd`.
- **Workers log retention is short on Free (3 days)** — Debugging “why did stock vanish last week” may lack logs unless Paid or external logging is set up early.
- **CORS is mostly an Expo Web problem** — Native HTTPS calls look fine until a web build needs Workers CORS headers.
- **Durable Objects / WebSockets are a distraction here** — Interview answers are request/response only; adopting them “because Cloudflare has them” adds cost and complexity you do not need.

## Operational Story

- **Preview deploys**: Use Wrangler environments (e.g. `--env preview`) or separate Worker names per branch; wire GitHub Actions (already the planned CI provider) to `npx wrangler deploy --env preview` on PRs. For Expo API routes via EAS Hosting instead, PR preview URLs come from `eas deploy`. Protect staging URLs if household data is real (Cloudflare Access or equivalent). Fork PRs should not receive production secrets.
- **Secrets**: Store Worker secrets with `npx wrangler secret put <NAME>` (account-scoped, not in git). Keep Supabase keys and EAS credentials in GitHub Actions secrets / EAS secrets for builds. Rotate by putting a new secret value then redeploying; never commit `.env*.local`. Agents may list secret *names* but must not echo values.
- **Rollback**: `npx wrangler rollback` (previous) or `npx wrangler rollback <version-id>` after `npx wrangler deployments list` / versions list — typically seconds to revert Worker code. **Database migrations and Supabase RLS changes do not roll back with Wrangler** — treat schema as a separate, human-approved step.
- **Approval**: Human required for production Worker publish (merge to main or explicit `--env production`), rotating primary Supabase service-role key, App Store / Play Store submit via EAS, and any destructive DB change. Agents may deploy to preview, tail logs, and open PRs unattended.
- **Logs**: Read-only stream with `npx wrangler tail` (optional `--status error`, `--format json`). Cloudflare dashboard Workers Logs for retained events (Free: 3-day retention). EAS Build/Submit logs via `eas build:view` / Expo dashboard for the mobile pipeline.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Unnecessary BFF adds auth/RLS bypass bugs (service role in Worker) | Pre-mortem / Devil's advocate | M | H | Default to client → Supabase with RLS; if Worker needed, forward user JWT and never use service role for household mutations |
| Node libraries break on Workers runtime | Devil's advocate / Research | M | M | Prefer fetch-native SDKs; spike-test deps in `wrangler dev` before adopting; keep BFF thin |
| Free-plan CPU limit causes aisle-time failures | Devil's advocate | L | H | Measure CPU on enrichment paths; set CPU limits; upgrade to Workers Paid ($5/mo) before launch if enrichment is server-side |
| Data split across Supabase + Cloudflare D1/R2 | Devil's advocate | M | M | Explicit rule: Postgres/auth stay on Supabase; Workers hold no source-of-truth inventory data |
| Mobile cannot hit local Worker | Devil's advocate | H | L | Use `wrangler dev --ip 0.0.0.0` + device LAN, or deploy preview early; document EXPO_PUBLIC_API_URL |
| EAS Hosting vs raw Workers confusion | Unknown unknowns | M | M | Decide per need: Expo `+api` only → EAS Hosting; custom bindings → Wrangler Worker in this Cloudflare account |
| Short Free log retention | Unknown unknowns / Research | M | M | Enable Workers Paid or ship critical audit events to Supabase/table logging before beta |
| Store review / EAS Submit delay overshadows backend | Pre-mortem | H | M | Parallelize: ship store builds on direct Supabase first; add Worker only for a proven gap |

## Getting Started

Concrete first steps for **this** repo (Expo `~56.0.5`, expo-router, npm):

1. **Keep shipping the app on EAS** (already the tech-stack default): `npx eas-cli@latest login`, configure `eas.json`, then `eas build` / `eas submit` for iOS/Android. Do not replace this with Cloudflare.
2. **Stand up auth/data on an external provider first** (e.g. Supabase project + RLS for household membership). Point the Expo app at it via `EXPO_PUBLIC_*` env (gitignored `.env*.local`). Validate stock list / barcode flows against Supabase before adding a BFF.
3. **Only if a BFF is required**, scaffold a Worker beside the app (separate folder, e.g. `workers/api`):
   ```bash
   npm create cloudflare@latest -- workers/api --type=hello-world --lang=ts --no-deploy
   cd workers/api
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put SUPABASE_URL
   ```
   Tail production: `npx wrangler tail`. Roll back: `npx wrangler rollback`.
4. **If the BFF is Expo Router `+api` routes** rather than a standalone Worker: enable server output per Expo Router API Routes docs, prefer **EAS Hosting** (`eas deploy`) which runs on Cloudflare Workers — or use `expo-server/adapter/workerd` with Wrangler when you need your own Cloudflare bindings. Local server check: `npx expo serve` after export (see Expo SDK 56 server docs).
5. **Wire CI later (out of scope here)**: GitHub Actions on merge → `wrangler deploy` for the Worker and/or EAS Workflows for builds — matching `ci_default_flow: auto-deploy-on-merge` in tech-stack.md.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
