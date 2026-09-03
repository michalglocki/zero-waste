# Minimal Household Auth — Plan Brief

> Full plan: `context/changes/minimal-household-auth/plan.md`
> Research: none (planned from roadmap F-01 + foundation docs)

## What & Why

Ship the smallest auth contract so a signed-in user is tied to one shared household. Without membership + session, stock slices cannot assume a logged-in household member or enforce shared inventory.

## Starting Point

Expo SDK 56 tabs-only shell with no Supabase client, migrations, or route guards. Infra already defaults to Expo → Supabase Auth + Postgres + RLS; the Worker stays hello-world.

## Desired End State

Email/password signup lands the user in a gated app with an auto-created household and invite code. A second adult joins via that code (membership moves; empty solo household is deleted). Sign-out restores the auth gate. RLS helpers are ready for S-01 stock tables.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Data path | Expo → Supabase direct | Avoid Worker/service-role bypass; matches infra default | Research |
| Sign-in | Email + password | Fastest Expo path; no deep links/OAuth | Plan |
| Email confirm | Off for MVP | Immediate session for after-hours demos | Plan |
| Household bootstrap | Auto-create on signup (DB trigger) | Guarantees every session has a household | Plan |
| Second member | Short invite code + RPC move | Proves shared household without email-invite infra | Plan |
| Schema boundary | Membership tables + RLS helpers only | Stock persistence belongs to S-01 | Plan / Roadmap |
| Route gate | Hard gate on session **and** membership | Matches US-01 “logged-in household member” | Plan |
| Verification | Manual two-user script + lint/typecheck | No test runner in repo; don’t add one here | Plan / AGENTS |

## Scope

**In scope:** Supabase project wiring; households/memberships schema; signup trigger; join RPC; Expo client + providers; `(auth)`/`(app)` protected routes; invite + join UI; env template; typecheck script; manual checklist.

**Out of scope:** Stock CRUD; roles/admin; OAuth/magic links; email confirm; Worker BFF; new test runner; EAS/CI; multi-household picker.

## Architecture / Approach

```
Expo app ──(anon key)──► Supabase Auth
                │
                ▼
         Postgres + RLS
    households ◄── memberships (user_id UNIQUE)
         ▲              ▲
    signup trigger   join_household_by_invite_code RPC
```

Client holds session via Expo’s Supabase storage path; `Stack.Protected` hides tabs until session + membership exist.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Supabase + schema/RLS | Project, migrations, trigger, join RPC, confirm off | Misconfigured confirm-email / open membership INSERT |
| 2. Expo client + providers | Client, session + household context | Session restore / trigger lag |
| 3. Route gate + auth UI | Protected `(auth)`/`(app)`, sign-in/up | Flash of protected UI before hydrate |
| 4. Household + join UI | Invite code + join-move | Empty-household delete races (mitigated by RPC txn) |
| 5. Verification wiring | `typecheck` + two-user checklist | Manual-only regression coverage |

**Prerequisites:** Supabase account; ability to set `EXPO_PUBLIC_*` in `.env.local`
**Estimated effort:** ~2–3 after-hours sessions across 5 phases

## Open Risks & Assumptions

- Confirm-email left on will look like “signup broken” (no session).
- Short invite codes are guessable; rate limits deferred until needed.
- Signup trigger failure: recovery is retry + sign-out only (no ensure RPC); rare stuck rows need manual DB fix.
- Turning confirm-email on later requires a new interstitial flow.
- Auth gate uses Expo SplashScreen API — starter `AnimatedSplashOverlay` is not the hydrate gate.

## Success Criteria (Summary)

- Two real accounts end on the **same** household via invite code
- Unauthenticated users cannot reach app tabs
- Session restores after cold start; lint + typecheck pass
