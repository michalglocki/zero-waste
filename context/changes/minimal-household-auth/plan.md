# Minimal Household Auth Implementation Plan

## Overview

Stand up email/password auth on Supabase, wire an Expo session with a hard route gate, and bind every signed-in user to exactly one household (auto-created on signup, joinable via invite code) so later stock slices can assume a shared inventory under RLS.

## Current State Analysis

- Expo SDK 56 starter only: root `src/app/_layout.tsx` mounts theme + `AppTabs` with `index` / `explore` — no auth provider, no redirects, no route groups.
- No `@supabase/supabase-js`, no `supabase/` migrations, no `.env.example`. Env pattern is gitignored `.env*.local` with `EXPO_PUBLIC_*` (see `infrastructure.md`).
- Cloudflare Worker (`workers/api`) is hello-world only and must stay out of this change — default path is Expo → Supabase Auth + Postgres + RLS directly.
- PRD Access Control: login required; one shared household; flat roles (no admin/member). Sign-in mechanism was TBD; this plan locks email/password with confirm-email **off** for MVP.
- Roadmap F-01 risk: keep the contract to membership + session — not account admin. Stock persistence belongs in S-01.

## Desired End State

A developer can run the Expo app against a configured Supabase project, sign up with email/password, land in the gated app already tied to a household, see a shareable invite code, and have a second account join that household (moving off its auto-created solo household). Sign-out returns the user to auth screens. RLS helpers exist so S-01 can scope stock rows by household without redesigning membership.

### Key Discoveries:

- Hard gate should require **session and membership**, not session alone (`src/app/_layout.tsx` today has neither).
- Prefer Expo Router `Stack.Protected` over ad-hoc `Redirect` layouts ([Expo authentication](https://docs.expo.dev/router/advanced/authentication/)).
- Session persistence: follow Expo’s current Supabase guide (`expo-sqlite` `localStorage` on native; browser `localStorage` on web) with `detectSessionInUrl: false` and AppState-tied auto-refresh.
- Auto-create household via **DB trigger** on `auth.users`; join/move via **SECURITY DEFINER RPC** — do not allow open client `INSERT` on `memberships` (RLS footgun).
- No app test runner is configured (`AGENTS.md`); verification is lint + `tsc --noEmit` + a documented two-user manual script.

## What We're NOT Doing

- Stock / product tables, stock CRUD, barcode flows (S-01+)
- Admin vs member roles, account-admin UI, leave/transfer household beyond join-move
- Email confirmation, magic links, OAuth providers
- Routing auth through the Cloudflare Worker or using the service role in the client
- Adding a unit/e2e test runner
- EAS store pipeline / CI for auth (parked until after S-01 per roadmap)
- Multi-household membership or household picker
- `ensure_household_for_me` (or any client-callable self-heal RPC) — recovery is retry + sign-out only
- Using `AnimatedSplashOverlay` as the auth hydrate gate (use Expo SplashScreen API instead)

## Implementation Approach

1. Create a Supabase project and commit SQL migrations under `supabase/migrations/` for households, memberships, RLS helper functions, signup trigger, and join RPC.
2. Add the Supabase JS client and session storage to the Expo app; wrap root layout with session + household providers.
3. Restructure routes into `(auth)` and `(app)` with `Stack.Protected` so tabs only render when session and membership exist.
4. Ship minimal sign-in / sign-up screens and an in-app household surface (invite code + join form).
5. Document and run a two-user manual verification script; add a `typecheck` script if missing.

## Critical Implementation Details

### Timing & lifecycle

Gate the native Expo splash with `SplashScreen.preventAutoHideAsync` until the initial session restore **and** membership fetch resolve, then call `hideAsync`. Do **not** treat `AnimatedSplashOverlay` as the auth gate — remove it from the root auth layout (or stop mounting it) so the starter ~600ms Reanimated overlay cannot dismiss before `isReady`. After `signUp` / `signIn`, poll or retry membership briefly — the `auth.users` trigger can lag one round-trip behind the returned session. If membership never appears, show a recovery screen rather than trapping the user behind a dead protected guard.

### State sequencing

Join must be a single RPC call (`join_household_by_invite_code`), not separate PostgREST leave + insert. The RPC moves the caller’s unique membership, then deletes the previous household only when it has zero members. Client-side multi-step writes under RLS are out of bounds for this change.

---

## Phase 1: Supabase project + schema/RLS

### Overview

Provision Supabase, turn confirm-email off for MVP, and land migrations that create the household membership contract (tables, helpers, signup trigger, join RPC, RLS).

### Changes Required:

#### 1. Supabase project + Auth settings

**File**: Supabase dashboard (human) + `supabase/config.toml` (if CLI-init)

**Intent**: Create the project that hosts Auth + Postgres. Disable “Confirm email” so `signUp` returns a session immediately for MVP demos.

**Contract**: Auth email provider has confirm-email **off** in the project used by local `.env*.local`. Document this in the change Notes / verification script so prod re-enable is intentional later.

#### 2. Schema migration

**File**: `supabase/migrations/<timestamp>_households_memberships.sql`

**Intent**: Create `households` (with short unique `invite_code`) and `memberships` (`user_id` UNIQUE → one household per user). No role column. No stock tables.

**Contract**:
- `households(id uuid PK, invite_code text UNIQUE NOT NULL, created_at timestamptz)`
- `memberships(user_id uuid PK references auth.users, household_id uuid NOT NULL references households, created_at timestamptz)`
- Helper functions e.g. `current_household_id()`, `is_household_member(uuid)` as `SECURITY DEFINER` with fixed `search_path`
- `AFTER INSERT ON auth.users` trigger: create household (generate non-sequential invite code) + membership for `NEW.id`
- RPC `join_household_by_invite_code(p_code text)` → `SECURITY DEFINER`: resolve code (normalize case), no-op if already member, else move membership and delete empty prior household; `GRANT EXECUTE` to `authenticated`
- RLS: clients may `SELECT` own household / co-member rows via helpers; deny client `INSERT`/`UPDATE`/`DELETE` on `households` and `memberships` (writes only via trigger/RPC)

#### 3. Env template

**File**: `.env.example` (committed) + local `.env.local` (gitignored)

**Intent**: Document required public keys without committing secrets.

**Contract**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or publishable key). Never document service role for the app.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly via Supabase CLI or SQL editor without errors
- `supabase/` migration file exists and is committed with the change

#### Manual Verification:

- Confirm-email is off in the Supabase Auth settings for the MVP project
- Dashboard shows `households` and `memberships` with RLS enabled
- Creating a user in Auth (or via later app signup) produces a household + membership row

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Expo client + session providers

### Overview

Install deps, create the Supabase client with persistent storage, and expose session + household membership to the tree.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add Supabase client and Expo’s documented session storage dependency using Expo-compatible install.

**Contract**: `@supabase/supabase-js` and `expo-sqlite` (for `localStorage` install path per [Expo Using Supabase](https://docs.expo.dev/guides/using-supabase/)). Add `expo-sqlite` config plugin to `app.json` if required by that guide. Prefer `npx expo install` for version alignment.

#### 2. Supabase client

**File**: `src/lib/supabase.ts` (and storage sibling only if needed)

**Intent**: Single shared client reading `EXPO_PUBLIC_*` env, persisting sessions across cold starts.

**Contract**: `createClient` with `auth.persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`, platform-appropriate storage. Wire `AppState` so auto-refresh runs when the app is active and stops when backgrounded.

#### 3. Auth + household providers / hooks

**File**: `src/providers/auth-provider.tsx`, `src/providers/household-provider.tsx`, thin hooks under `src/hooks/`

**Intent**: Subscribe to `onAuthStateChange`, load membership for `auth.uid()`, expose `{ session, membership, isReady, signIn, signUp, signOut, refreshMembership, joinByInviteCode }`-shaped API (exact names flexible).

**Contract**: `isReady` becomes true only after initial session restore attempt finishes. Household provider no-ops until session exists; after auth, loads membership (with short retry for trigger lag). Follow kebab-case modules and `@/` imports. Do not add unnecessary `useMemo`/`useCallback` (React Compiler on).

#### 4. Auth / household service wrappers

**File**: `src/services/auth.ts`, `src/services/household.ts`

**Intent**: Keep screen components thin; centralize Supabase calls.

**Contract**: Email/password `signUp` / `signInWithPassword` / `signOut`; `getMembership`; `getInviteCode` for current household; `joinByInviteCode` calling the RPC.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` passes (or `npm run typecheck` once added)
- `npm run lint` passes
- App starts with valid `.env.local` without crashing on import of the client

#### Manual Verification:

- After a temporary throwaway signup from a scratch screen or REPL, session persists across app reload
- Membership row is readable from the client after signup (once Phase 1 trigger exists)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Route gate + auth UI

### Overview

Restructure expo-router into protected `(auth)` / `(app)` groups and ship email/password screens. Tabs only appear when session and membership exist.

### Changes Required:

#### 1. Root layout gate

**File**: `src/app/_layout.tsx`

**Intent**: Wrap providers and use `Stack.Protected` so unauthenticated users cannot reach app tabs.

**Contract**:
- Providers outside the navigator
- Expo `SplashScreen.preventAutoHideAsync` until `isReady` (and membership resolution for signed-in users), then `hideAsync`; do not mount `AnimatedSplashOverlay` on this layout
- Guard `(app)` with `!!session && !!membership`
- Guard `(auth)` with `!session`
- Guard a recovery route (e.g. `bootstrap-household`) with `!!session && !membership`

#### 2. Move tabs under `(app)`

**File**: `src/app/(app)/_layout.tsx`, move `index.tsx` / `explore.tsx`, keep `src/components/app-tabs.tsx` (+ `.web.tsx`)

**Intent**: Preserve existing tab chrome inside the protected group.

**Contract**: `(app)/_layout` renders `AppTabs` (or equivalent). Starter explore tab may remain as placeholder; home becomes the household surface in Phase 4 if not already.

#### 3. Auth screens

**File**: `src/app/(auth)/_layout.tsx`, `src/app/(auth)/sign-in.tsx`, `src/app/(auth)/sign-up.tsx`, shared form under `src/components/auth/`

**Intent**: Minimal email/password sign-in and sign-up using themed components and existing spacing/tokens.

**Contract**: Default-export route screens; on success, rely on providers + Protected routes (no manual deep navigation hacks). Surface Supabase errors in plain text. No email-confirm interstitial (confirm off).

#### 4. Membership recovery screen

**File**: `src/app/bootstrap-household.tsx` (or under a small group)

**Intent**: If session exists but membership is missing after retries, offer retry / sign-out instead of a blank gate. F-01 does **not** self-heal via an ensure RPC — persistent trigger failure is resolved by sign-out (and manual DB fix if needed).

**Contract**: Accessible only under the `session && !membership` guard; retry only re-fetches membership; primary escape is `signOut`. No `ensure_household_for_me` (or equivalent) in this change.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run typecheck` (or `npx tsc --noEmit`) passes
- Typed routes still resolve after the group move (`experiments.typedRoutes` remains on)

#### Manual Verification:

- Cold start signed-out → land on sign-in/sign-up, cannot open tabs via URL/back stack
- Sign-up → lands in `(app)` after membership appears
- Sign-out → returns to auth screens; protected routes inaccessible

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Household surface + invite join

### Overview

Show the current household invite code inside the gated app and allow a second user to join by code (membership move + empty household cleanup via RPC).

### Changes Required:

#### 1. Household home UI

**File**: `src/app/(app)/index.tsx`, components under `src/components/household/`

**Intent**: Replace starter welcome content with a minimal “you’re in a household” surface: show invite code, copy affordance optional, sign-out control.

**Contract**: Reads invite code for `current_household_id()` via service/hook. No stock list UI.

#### 2. Join-by-code UI

**File**: `src/app/(app)/join.tsx` and/or inline form on home; `src/components/household/join-household-form.tsx`

**Intent**: Authenticated member enters another household’s code; on success, UI refreshes to the new household’s code/id.

**Contract**: Calls `join_household_by_invite_code` only. Confirm before move if the user already has a different household (copy: joining leaves the current household). Handle invalid code with a clear error.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run typecheck` (or `npx tsc --noEmit`) passes

#### Manual Verification:

- User A sees an invite code after signup
- User B (fresh signup) joins A’s code and then shows A’s household id/code
- B’s original solo household is gone when it had no remaining members
- Joining the same code again is a no-op success
- Invalid code shows an error and does not change membership

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Verification script + typecheck wiring

### Overview

Make F-01 “done” checkable without a new test runner: add `typecheck` script if missing and a documented two-user manual script.

### Changes Required:

#### 1. Typecheck script

**File**: `package.json`

**Intent**: Give agents and humans one command for TS verification.

**Contract**: `"typecheck": "tsc --noEmit"` (or project-equivalent) alongside existing `lint`.

#### 2. Manual verification checklist

**File**: `context/changes/minimal-household-auth/manual-verification.md` (or `scripts/manual-two-user-auth.md`)

**Intent**: Capture the exact two-user path and Auth dashboard prerequisites (confirm-email off, env vars).

**Contract**: Steps covering signup A, code visible, signup B, join, empty-household cleanup, sign-out gate, session restore. Note that service role must never be in the app env.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run typecheck` passes

#### Manual Verification:

- Checklist executed once end-to-end on a real device or simulator + second account
- Results noted in change Notes or verification file (pass/fail)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before treating F-01 as implemented.

---

## Testing Strategy

### Unit Tests:

- None — no app unit runner configured; do not add one in this change.

### Integration Tests:

- None automated. SQL/RPC correctness is validated by the manual two-user path and dashboard inspection.

### Manual Testing Steps:

1. Confirm Auth “Confirm email” is disabled for the MVP project.
2. Sign up User A → gated home shows invite code; dashboard has one household + membership.
3. Sign up User B → separate household; enter A’s code → confirm move → B shows A’s household; B’s empty household deleted.
4. Sign out B → auth screens only; sign in again → still on A’s household.
5. Enter invalid code → error; membership unchanged.
6. Kill and relaunch app while signed in → session + membership restore without re-login.

## Performance Considerations

Membership fetch is a single-row read; keep the post-auth retry short (low hundreds of ms × few attempts). Invite codes should be random enough to avoid trivial guessing; rate-limiting the join RPC can wait until abuse appears.

## Migration Notes

- Schema/RLS changes do not roll back with Wrangler — apply and review SQL deliberately (`infrastructure.md`).
- Confirm-email off is an MVP convenience; turning it on later will break “session on signup” unless a confirm interstitial is added.
- S-01 should add stock tables with `household_id` constrained by `current_household_id()` / `is_household_member` — do not weaken F-01 helpers when extending.

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- PRD Access Control: `context/foundation/prd.md`
- Infra default Expo → Supabase: `context/foundation/infrastructure.md`
- Deploy next milestone notes: `context/deployment/deploy-plan.md`
- Expo Using Supabase: https://docs.expo.dev/guides/using-supabase/
- Expo Router auth / protected: https://docs.expo.dev/router/advanced/authentication/
- Expo SecureStore / SDK 56 (if storage path diverges): https://docs.expo.dev/versions/v56.0.0/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Supabase project + schema/RLS

#### Automated

- [x] 1.1 Migration applies cleanly via Supabase CLI or SQL editor without errors — 2c93346
- [x] 1.2 `supabase/` migration file exists and is committed with the change — 2c93346

#### Manual

- [x] 1.3 Confirm-email is off in the Supabase Auth settings for the MVP project — 2c93346
- [x] 1.4 Dashboard shows `households` and `memberships` with RLS enabled — 2c93346
- [x] 1.5 Creating a user in Auth produces a household + membership row — 2c93346

### Phase 2: Expo client + session providers

#### Automated

- [x] 2.1 `npx tsc --noEmit` / `npm run typecheck` passes — 89b79e3
- [x] 2.2 `npm run lint` passes — 89b79e3
- [x] 2.3 App starts with valid `.env.local` without crashing on import of the client — 89b79e3

#### Manual

- [x] 2.4 Session persists across app reload after signup — 88a9808
- [x] 2.5 Membership row is readable from the client after signup — 88a9808

### Phase 3: Route gate + auth UI

#### Automated

- [x] 3.1 `npm run lint` passes — 88a9808
- [x] 3.2 `npm run typecheck` passes — 88a9808
- [x] 3.3 Typed routes still resolve after the group move — 88a9808

#### Manual

- [x] 3.4 Cold start signed-out lands on auth; tabs inaccessible — 88a9808
- [x] 3.5 Sign-up lands in `(app)` after membership appears — 88a9808
- [x] 3.6 Sign-out returns to auth; protected routes inaccessible — 88a9808

### Phase 4: Household surface + invite join

#### Automated

- [x] 4.1 `npm run lint` passes
- [x] 4.2 `npm run typecheck` passes

#### Manual

- [x] 4.3 User A sees an invite code after signup
- [x] 4.4 User B joins A’s code and shows A’s household id/code
- [x] 4.5 B’s original solo household is deleted when empty
- [x] 4.6 Re-joining the same code is a no-op success
- [x] 4.7 Invalid code shows an error and does not change membership

### Phase 5: Verification script + typecheck wiring

#### Automated

- [ ] 5.1 `npm run lint` passes
- [ ] 5.2 `npm run typecheck` passes

#### Manual

- [ ] 5.3 Two-user checklist executed end-to-end
- [ ] 5.4 Results noted in change Notes or verification file
