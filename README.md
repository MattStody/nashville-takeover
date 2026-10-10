# The Nashville Takeover

Event platform for The Nashville Takeover: a mobile app for guests and
on-site staff, a web dashboard for managers, and a Supabase backend synced with
Luma ticketing. No financial data is stored or displayed anywhere.

Status: **Phase 1 (foundation)**. See `DECISIONS.md` for architecture.

## Layout

```
apps/admin          Next.js dashboard (Phase 3)
apps/mobile         Expo app (Phases 4–5)
packages/shared     Domain types, zod schemas, Luma adapter (mock + live), seed generator
supabase/
  migrations/       Schema, RLS, views, RPCs
  functions/        Edge functions (Phase 2)
  tests/            RLS and RPC tests (Vitest + pg)
  seed.sql          GENERATED demo data (pnpm seed:generate)
```

## Setup

Requires Node 20+, pnpm 10, and Postgres 15+ or the Supabase CLI.

```bash
pnpm install
pnpm typecheck
pnpm --filter @nt/shared test
```

### Database tests

The RLS suite needs a Postgres server. With plain Postgres it creates a
throwaway `nt_test` database, applies a Supabase shim and the migrations:

```bash
DATABASE_URL=postgres://postgres@localhost:5432/postgres pnpm test:db
```

With the Supabase CLI (`supabase start`, which applies migrations and seed),
point `DATABASE_URL` at it instead (`postgres://postgres:postgres@localhost:54322/postgres`).

### Seed data

`supabase/seed.sql` is generated from the mock Luma dataset. After changing
`packages/shared/src/luma/mock` or `src/seed`, run `pnpm seed:generate`.

Seeded accounts (sign in with email OTP; Inbucket at http://localhost:54324
when using `supabase start`):

| Email | Role |
| --- | --- |
| admin@example.com | Admin |
| manager@example.com | Manager, Broadway Night + East Side |
| staff@example.com | Staff, Broadway Night |
| staff2@example.com | Staff, East Side |
| guest@example.com | Guest: 2 VIP tickets at Broadway Night, 1 GA at East Side |

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `LUMA_MODE` | Edge function secrets | `mock` (default) or `live` |
| `LUMA_API_KEY` | Edge function secrets **only** | Luma API key (Luma Plus). Never in app env. |
| `DATABASE_URL` | Local / CI | Postgres for the RLS test suite |
