# Supabase integration harness

Phase 2 of `testing-bootstrap-izolacja-gospodarstw`. These helpers seed two
households and expose **anon / user JWT** clients for RLS assertions. The
service role is **seed and teardown only** — never use it inside `expect()`.

**Target:** a dedicated **hosted** Supabase project (not production).

## Prerequisites

1. A disposable hosted Supabase project used only for automated tests
2. Repo migrations under `supabase/migrations/` applied to that project
3. `.env.test.local` with URL + anon + service role (never `EXPO_PUBLIC_*`)

## Prepare the test project

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard) (or reuse a throwaway one).
2. Apply migrations (Supabase CLI login + link):

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

3. Project Settings → API: copy **Project URL**, **anon** `public` key, and **service_role** `secret` key.

Do **not** point this harness at the production / demo app project — seed creates
and deletes auth users and stock rows.

## Configure test env

```bash
cp .env.test.example .env.test.local
```

Fill `.env.test.local`:

| Dashboard / API setting | `.env.test.local` |
| ----------------------- | ----------------- |
| Project URL | `SUPABASE_URL` |
| anon / public key | `SUPABASE_ANON_KEY` |
| service_role / secret key | `SUPABASE_SERVICE_ROLE_KEY` |

`.env.test.local` is gitignored (`.env*.local`). Keep service role out of the
Expo app `.env.local` / `EXPO_PUBLIC_*`.

## How to run tests (gating)

| Command | Config | What runs |
| ------- | ------ | --------- |
| `npm test` | jest-expo (`package.json#jest`) | App unit/smoke under `__tests__/` **except** `__tests__/integration/` |
| `npm run test:integration` | Node (`jest.integration.config.js`) | `__tests__/integration/**` only — harness + DB isolation |

Integration is gated out of `npm test` on purpose: Expo’s fetch polyfill breaks hosted
Supabase clients. Both remain part of the product test path; prefer `test:integration`
whenever you need RLS proofs.

```bash
npm run test:integration
```

Missing env or unreachable API → **clear failure** (no false green). The check script
`scripts/check-integration-env.js` refuses to start Jest without credentials.

### Suites under `__tests__/integration/`

- `harness-self-check.test.ts` — seed + authenticate A/B
- `readiness-fail-fast.test.ts` — missing env / unreachable URL
- `db-isolation.test.ts` — risks **#1** (cross-household), **#2a** (membership deny), **#5** (anon + non-member)
- `db-trusted-client-baseline.test.ts` — risk **#2b** trusted-client **allow** baseline/alarm (own-household direct DELETE + unpaired utilization INSERT; not a harden)

Protected route-gate truth-table (secondary #5) lives under `__tests__/root-route-guards.test.ts` and runs via `npm test` (jest-expo), not this integration config.

## Privilege split

| Client | Key | Use |
| ------ | --- | --- |
| `createSeedClient` | service role | seed / teardown only |
| `createAnonClient` | anon, no session | #5 anon asserts |
| `createAuthedClient` / `createAssertionClients` | anon + user JWT | #1 / #2a / #5 member asserts |

## Fixture shape

`seedIsolationFixture` returns:

- `userA` / `userB` — distinct `householdId`, each with a stock row
- `sharedBarcode` — same barcode in both households (makes cross-household barcode bugs falsifiable)
- `nonMember` — confirmed auth user with membership removed
