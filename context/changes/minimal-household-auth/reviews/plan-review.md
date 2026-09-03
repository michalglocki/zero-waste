<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Minimal Household Auth Implementation Plan

- **Plan**: `context/changes/minimal-household-auth/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-03
- **Verdict**: REVISE
- **Findings**: 0 critical 4 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 modify-targets exist ✓; create-new paths (supabase/, src/lib/, …) correctly absent ✓; brief↔plan ✓

## Findings

### F1 — Splash “until ready” conflicts with current overlay

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details → Timing; Phase 3 root layout
- **Detail**: Plan said keep splash until hydrate, but `AnimatedSplashOverlay` self-hides after ~600ms and never uses Expo SplashScreen API.
- **Fix A ⭐ Recommended**: Gate with Expo SplashScreen API; drop overlay from auth path
- **Fix B**: Drive AnimatedSplashOverlay visibility from isReady
- **Decision**: FIXED via Fix A

### F2 — Migration contract omits table GRANTs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Schema migration Contract
- **Detail**: RLS specified without explicit GRANT SELECT / EXECUTE for authenticated.
- **Fix**: Add explicit GRANT SELECT (and EXECUTE on RPC/helpers) for `authenticated`; keep writes denied except via SECURITY DEFINER paths.
- **Decision**: PENDING

### F3 — Web AppTabs hardcodes not called out in Phase 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Move tabs under `(app)`
- **Detail**: Web tabs use `name="home"` with `href="/"` and `href="/explore"`; plan must require verify/update after route move.
- **Fix**: In Phase 3 contract, require verifying web TabTrigger hrefs/names after the route move; update if needed.
- **Decision**: PENDING

### F4 — Recovery path left optional (ensure RPC vs retry-only)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 recovery + Phase 4.3 optional ensure RPC
- **Detail**: Recovery required but ensure RPC was optional — implementer could leave a dead-end retry.
- **Fix A ⭐ Recommended**: Lock retry + sign-out only for F-01 (no ensure RPC)
- **Fix B**: Make ensure RPC required in Phase 1
- **Decision**: FIXED via Fix A

### F5 — Invite code format unspecified

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 schema Contract
- **Detail**: “Non-sequential invite code” leaves length/charset unspecified.
- **Fix**: Specify e.g. 8-char Crockford base32 / similar in the migration contract.
- **Decision**: PENDING

### F6 — Prefer Expo’s publishable key env name

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 env template
- **Detail**: Expo guide uses `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; plan led with anon key.
- **Fix**: Make publishable key the primary name in `.env.example`; note anon as legacy alias if needed.
- **Decision**: PENDING
