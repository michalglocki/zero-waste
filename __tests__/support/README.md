# Local Supabase integration harness

Phase 2 of `testing-bootstrap-izolacja-gospodarstw`. These helpers seed two
households and expose **anon / user JWT** clients for RLS assertions. The
service role is **seed and teardown only** — never use it inside `expect()`.

## Prerequisites

1. Docker Desktop (or Podman) running — **required** for live seed / RLS suites
2. Supabase CLI available via `npx supabase`

Without Docker, `npm test` still runs smoke + fail-fast readiness checks.
`npm run test:integration` refuses to start without `.env.test.local`, and
`requireLocalSupabase` fails clearly if the API is down. Do **not** treat that
as household-isolation coverage — Phases 3+ need a running local stack.

## Bring up the DB

```bash
npx supabase start
```

Migrations under `supabase/migrations/` apply on start. If you need a reset:

```bash
npx supabase db reset
```

## Configure test env (not Expo public)

```bash
# from repo root — copy example, then fill from CLI status
cp .env.test.example .env.test.local
npx supabase status -o env
```

Map status output into `.env.test.local`:

| `supabase status -o env` | `.env.test.local` |
| ------------------------ | ----------------- |
| `API_URL`                | `SUPABASE_URL` |
| `ANON_KEY`               | `SUPABASE_ANON_KEY` |
| `SERVICE_ROLE_KEY`       | `SUPABASE_SERVICE_ROLE_KEY` |

`.env.test.local` is gitignored (`.env*.local`). **Never** put the service
role in `EXPO_PUBLIC_*` or `.env.local` for the Expo app.

## Run harness self-check

```bash
npm run test:integration
```

This runs `__tests__/integration/**` in band. If URL/keys are missing or
Supabase is down, the suite **fails with a clear error** (no false green).

App unit smoke (`npm test`) stays independent of Docker.

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
