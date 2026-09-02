---
project: zero-waste
platform: Cloudflare Workers
worker_name: zero-waste-api
worker_path: workers/api
auto_deploy: Cloudflare Workers Builds (Git → main)
pages_forbidden: true
ci_for_worker: cloudflare-workers-builds
mobile_ship_path: EAS (parallel; not this deploy)
created_at: 2026-09-02
based_on:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
---

# Deploy plan — first platform deploy (Cloudflare Workers)

## Scope

- Scaffold and deploy a thin **hello-world Worker** at `workers/api` named `zero-waste-api`.
- Wire **Cloudflare Workers Builds** so pushes to `main` auto-deploy the Worker.
- Establish CLI operability (`wrangler deploy` / `rollback` / `tail`).

## Out of scope (this deploy)

- Cloudflare **Pages** (commands and projects).
- GitHub Actions for the Worker (auto-deploy is Cloudflare-native).
- Supabase project / secrets / RLS.
- EAS Build/Submit / store binaries (mobile stays on EAS later).
- Real BFF logic, D1/KV/R2/Hyperdrive, service-role keys.

## Architecture reminder

Default MVP: **Expo app → Supabase (auth + Postgres + RLS) directly.**  
This Worker is a **platform slot** for a future thin BFF — not the host for inventory mutations yet.

## Allowed vs forbidden commands

**Allowed (Workers):**

- `npx wrangler login` / `whoami`
- `npx wrangler deploy`
- `npx wrangler deployments list`
- `npx wrangler rollback` / `npx wrangler rollback <version-id>`
- `npx wrangler tail`
- `npx wrangler versions upload` (preview / non-prod Builds)
- `npx wrangler secret put <NAME>` (later BFF only)

**Forbidden:**

- `wrangler pages …`
- `npm create cloudflare … --platform=pages`
- Any Pages dashboard “Pages project” path for this API

---

## Phase 0 — Prerequisites

Owner: **Human** (accounts / browser login); Agent assists with checks.

- [x] Node.js + npm available (Expo app already uses npm) — Node v22.22.0 / npm 11.13.0
- [x] Cloudflare account created — `Michalglocki@gmail.com's Account` (`1b65ac8983e0728c5e964642b62f822f`)
- [x] `npx wrangler login` completed in this environment
- [x] `npx wrangler whoami` shows expected account — `michalglocki@gmail.com`
- [x] GitHub remote exists (`origin`) — `https://github.com/michalglocki/zero-waste.git`
- [x] `workers.dev` subdomain registered — `zero-waste-mglocki` (via API; was blocking first deploy)
- [ ] (Optional, parallel) Expo account + `npx eas-cli@latest` — does **not** block Worker deploy

### CLI setup

```bash
# From repo root — Wrangler via npx (pinned by workers/api after scaffold)
cd workers/api
npx wrangler --version
npx wrangler login
npx wrangler whoami
```

Mobile tooling (later, not blocking):

```bash
npx eas-cli@latest login
npx eas-cli@latest whoami
```

---

## Phase 1 — Scaffold Worker

Owner: **Agent**

- [x] Run C3 hello-world TypeScript scaffold into `workers/api` with `--no-deploy`
- [x] Set `name` in `wrangler.jsonc` to `zero-waste-api` (must match dashboard Worker name for Builds)
- [x] Ensure `deploy` script exists in `workers/api/package.json`
- [x] Update root `.gitignore` for `.wrangler/`, `.dev.vars`, Worker `node_modules`
- [x] Do **not** initialize a nested git repo under `workers/api`
- [x] Generated `worker-configuration.d.ts` via `npx wrangler types`

```bash
npm create cloudflare@latest -- workers/api --type=hello-world --lang=ts --no-deploy
```

---

## Phase 2 — First manual deploy

Owner: **Agent** after Human completes `wrangler login`

- [x] `cd workers/api && npx wrangler deploy`
- [x] Record production `*.workers.dev` URL below
- [x] Verify HTTP 200 + hello body (`Hello World!`)
- [x] `npx wrangler deployments list` — version `97c587dd-1171-4e97-ac9d-d49508496355`
- [ ] Smoke `npx wrangler tail` (optional short attach)

```bash
cd workers/api
npx wrangler deploy
npx wrangler deployments list
# PowerShell: Invoke-WebRequest -Uri "https://zero-waste-api.zero-waste-mglocki.workers.dev/" -UseBasicParsing
```

### Deploy record

| Field | Value |
| --- | --- |
| Worker name | `zero-waste-api` |
| Worker tag (`external_script_id`) | `233a971954614982932fcfe7a02a5834` |
| workers.dev URL | `https://zero-waste-api.zero-waste-mglocki.workers.dev` |
| First deploy at | `2026-09-02T19:47:49.523Z` |
| First version ID | `97c587dd-1171-4e97-ac9d-d49508496355` |
| Rollback tested | _not yet_ |

**Secrets:** none for hello-world. Do **not** run `wrangler secret put` in this phase.

---

## Phase 3 — Auto-deploy on `main` (Workers Builds)

Owner: **Human** (dashboard Connect Git); Agent documents settings.

**Agent blocker:** Wrangler OAuth token cannot call Builds API (`403 Authentication error` on `/builds/tokens` and `/builds/.../triggers`). Connect Git + create Build token must be done in the dashboard (or with a user API token that includes **Workers Builds Configuration: Edit**).

**Dashboard deep link:**  
https://dash.cloudflare.com/1b65ac8983e0728c5e964642b62f822f/workers/services/view/zero-waste-api/production/settings

Cloudflare dashboard → **Workers & Pages** → `zero-waste-api` → **Settings** → **Builds** → **Connect**:

| Setting | Value |
| --- | --- |
| Git repository | `michalglocki/zero-waste` |
| Production branch | `main` |
| Root directory | Prefer `workers/api`. If left as `/`, root [`wrangler.jsonc`](../../wrangler.jsonc) must exist so Builds does **not** Expo-autoconfig the app onto this Worker |
| Build command | _(empty)_ or `npm ci` when root is `workers/api` |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy | `npx wrangler versions upload` |
| Non-production branch builds | Enabled (for PR preview versions) |
| API token | Auto-generated Builds token **or** scoped user token: Workers Scripts Edit; no unrelated DNS/billing |

**Name rule:** dashboard Worker name **must equal** `name` in `wrangler.jsonc` (`zero-waste-api`).

**GitHub App:** first Connect may prompt to install **Cloudflare Workers & Pages** on `michalglocki/zero-waste` — approve repository access.

- [x] Git connected in Builds — confirmed by user; GitHub check run `Workers Builds: zero-waste-api` fired on `f90842f`
- [x] Settings saved as above — Connect confirmed; first build failed on broken submodule (see below)
- [ ] Push/commit on `main` triggers a successful Build — retry after removing broken `context/foundation` gitlink
- [ ] Active Deployment updates after Build

**Failed build (root cause identified):**  
https://dash.cloudflare.com/1b65ac8983e0728c5e964642b62f822f/workers/services/view/zero-waste-api/production/builds/e9f3a670-a3da-470c-ba33-63a45c6515ae

```
Failed: error occurred while updating repository submodules
```

Cause: `context/foundation` was a **gitlink (mode 160000)** without `.gitmodules` / reachable submodule remote. Cloudflare Builds runs `git submodule update` and aborts. Fix: replace gitlink with normal tracked foundation markdown files (no nested `.git`).

**Explicit non-goal:** do **not** add `.github/workflows` for Worker deploy in this plan.

---

## Phase 4 — Verify auto-deploy

Owner: **Agent** (+ Human if Build needs dashboard confirmation)

- [ ] Trigger: merge/push to `main` touching `workers/api` (or empty commit only if needed)
- [ ] Build status = success in Cloudflare Builds
- [ ] `npx wrangler deployments list` shows new deployment
- [ ] `curl` still returns hello
- [ ] Update Deploy record table above with final URL + timestamps

---

## Rollback

```bash
cd workers/api
npx wrangler deployments list
npx wrangler rollback
# or: npx wrangler rollback <version-id>
```

Schema / Supabase RLS changes do **not** roll back with Wrangler (N/A for this hello-world).

---

## Production access boundary

| Action | Owner |
| --- | --- |
| Scaffold, wrangler config, deploy after login, curl/tail, update this file | Agent |
| Cloudflare account, browser `wrangler login`, Connect Git in Builds | Human |
| Rotate primary secrets, delete Worker/account, App Store / Play submit | Human only |

Tokens: scoped, not master keys. Never commit secrets or `.dev.vars`. Agents may list secret **names**, never echo values.

---

## Conscious deviations from foundation contracts

- **vs** `tech-stack.md` `ci_provider: github-actions`: Worker auto-deploy uses **Cloudflare Workers Builds**; GH Actions not added for the Worker.
- **vs** `infrastructure.md` “wire CI later via GHA”: this plan closes Worker auto-deploy on Cloudflare.
- **vs** “Supabase first”: first *platform* deploy is Worker hello; auth/data remain the next milestone.

---

## Next milestones (not this deploy)

1. Supabase project + RLS + `EXPO_PUBLIC_*` in `.env*.local`
2. `eas.json` + EAS Build / Submit for iOS/Android
3. Real BFF only when a proven gap exists — forward user JWT; never use service role for household mutations
4. Optional: Workers Paid if log retention / CPU limits bite

---

## Execution log

| When | What | Result |
| --- | --- | --- |
| 2026-09-02 | Plan written | This file created |
| 2026-09-02 | Registered `workers.dev` subdomain | `zero-waste-mglocki` |
| 2026-09-02 | Scaffold `workers/api` | Done (`zero-waste-api`, no nested git) |
| 2026-09-02 | First `wrangler deploy` | Live at `https://zero-waste-api.zero-waste-mglocki.workers.dev` (200 Hello World!) |
| 2026-09-02 | Workers Builds connected | Git connected; check run fires on push |
| 2026-09-02 | Auto-deploy verify push `f90842f` | Build `e9f3a670-…` **failed in 0s** — awaiting dashboard error / settings fix |
