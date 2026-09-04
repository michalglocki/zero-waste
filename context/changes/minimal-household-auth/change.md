---
change_id: minimal-household-auth
title: Minimal login tied to one shared household
status: implementing
created: 2026-09-03
updated: 2026-09-04
archived_at: null
---

## Notes

Roadmap F-01. Decisions from `/10x-plan`: email/password (confirm email off for MVP); auto-create household on signup; join via invite code with membership move; hard session+membership gate; schema = households/memberships/RLS helpers only (stock deferred to S-01); verify with manual two-user script + lint/typecheck.

**Auth prerequisite (MVP):** disable Confirm email in the Supabase Auth dashboard for the project used by `.env.local`. Re-enable intentionally later (will break session-on-signup without a confirm interstitial).

**Env:** copy `.env.example` → `.env.local` and set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` only (never the service role). Client also accepts `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as a fallback.

**Phase 2 note:** web auth storage uses browser `localStorage` (`.web.ts`); native uses `expo-sqlite/localStorage/install` so Expo Router static SSR does not pull WASM.

**Phase 3:** `(auth)` / `(app)` / `bootstrap-household` via `Stack.Protected`; SplashScreen hydrate gate; home has Sign out for verification (household invite UI is Phase 4).

**Phase 4:** Household home shows invite code + join form; web `(app)` uses Stack (`_layout.web.tsx`) because headless Tabs hrefs resolved to +not-found after the Protected group move.
