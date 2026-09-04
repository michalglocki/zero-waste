# Manual verification: minimal household auth (F-01)

Two-user path for email/password auth, household auto-create, invite join, and session restore. No automated e2e runner — run this once on a real device, simulator, or web against a configured Supabase project.

## Prerequisites

- [ ] Supabase Auth → **Confirm email** is **off** for the MVP project (session returned on signup).
- [ ] `.env.local` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or publishable key). **Never** put the service role key in the app env.
- [ ] Migration `supabase/migrations/20260904000000_households_memberships.sql` is applied.
- [ ] App starts: `npm start` (or platform target) without crashing on client import.
- [ ] Automated gate green: `npm run lint` and `npm run typecheck`.

## Two-user script

Use two distinct emails (User A and User B). Prefer private/incognito or sign-out between accounts on one device.

### 1. Sign up User A

1. Cold start signed out → land on sign-in / sign-up (tabs not reachable).
2. Sign up User A with email/password.
3. After membership appears, land in the gated `(app)` home.
4. Home shows an **invite code** and household id.
5. In Supabase dashboard: one `households` row + one `memberships` row for A.

**Result:** ☐ pass / ☐ fail — notes:

### 2. Sign up User B and join A

1. Sign out A (or use a second browser/device).
2. Sign up User B → B gets a separate household + invite code.
3. On B’s home, enter A’s invite code in the join form.
4. Confirm the move (joining leaves the current household).
5. After success, B’s home shows **A’s** household id and invite code (same as A).
6. Dashboard: B’s membership points at A’s household; B’s original solo household is **deleted** (zero members).

**Result:** ☐ pass / ☐ fail — notes:

### 3. Idempotent re-join + invalid code

1. As B, enter A’s code again → success / no-op; membership unchanged.
2. Enter an invalid code → clear error; B still on A’s household.

**Result:** ☐ pass / ☐ fail — notes:

### 4. Sign-out gate + session restore

1. Sign out B → auth screens only; protected routes inaccessible via URL / back stack.
2. Sign in B again → still on A’s household (same code/id).
3. Kill and relaunch the app while signed in → session + membership restore without re-login.

**Result:** ☐ pass / ☐ fail — notes:

## Run log

| Date       | Environment (device / sim / web) | Operator | Overall   |
| ---------- | -------------------------------- | -------- | --------- |
| 2026-09-04 | confirmed by operator            | human    | ☑ pass    |

**Overall notes:** End-to-end two-user path confirmed pass (Phase 5 manual gate).
