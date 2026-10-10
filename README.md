# The Nashville Takeover

Event platform for The Nashville Takeover: a mobile app for guests and
on-site staff, a web dashboard for managers, and a Supabase backend synced with
Luma ticketing. No financial data is stored or displayed anywhere.

Status: **Phase 2 (Luma integration)**. See `DECISIONS.md` for architecture.

## Layout

```
apps/admin          Next.js dashboard (Phase 3)
apps/mobile         Expo app (Phases 4–5)
packages/shared     Domain types, zod schemas, Luma adapter (mock + live), seed generator
supabase/
  migrations/       Schema, RLS, views, RPCs
  functions/        Edge functions: luma-sync, luma-webhook, luma-resolve-key
    _shared/nt/     GENERATED copy of packages/shared/src (pnpm functions:vendor)
  tests/            RLS and RPC tests (Vitest + pg)
  seed.sql          GENERATED demo data (pnpm seed:generate)
```

## Setup

Requires Node 20+, pnpm 10, Deno 2 (edge functions), and Postgres 15+ or the Supabase CLI.

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

## Luma integration

Edge functions (Deno):

| Function | Who | Body |
| --- | --- | --- |
| `luma-sync` | manager+ | `{"action":"sync","event_id":"<uuid>"}`; repeat with the returned `run_id` while `done` is false |
| `luma-sync` | admin | `{"action":"link","luma_event_id":"evt-..."}` creates a draft event from Luma and syncs it |
| `luma-sync` | service role | `{"action":"sync_all"}` for the cron job |
| `luma-sync` | admin / service | `{"action":"status"}` (mode, key set, webhook registered) and `{"action":"register_webhook"}` |
| `luma-webhook` | Luma | registered by `register_webhook` with a Vault-generated `?token=` |
| `luma-resolve-key` | staff+ | `{"event_id":"<uuid>","key":"<pk>"}` for QR keys not known locally |

Mock mode (`LUMA_MODE=mock`, the default) serves the same fake dataset the
seed uses, so everything runs without a Luma key.

### Deploying (project `xmwyrppnznisdhmervye`)

Migrations and functions are deployed with the Supabase connector or CLI:

```bash
supabase link --project-ref xmwyrppnznisdhmervye
supabase db push
pnpm functions:vendor
supabase functions deploy luma-sync luma-webhook luma-resolve-key
```

Edge function secrets (Dashboard → Edge Functions → Secrets): `LUMA_API_KEY`,
and `LUMA_MODE=live` once ready. Nothing else: the webhook URL token and the
cron token are generated inside the database (Supabase Vault, see
`internal_secret()`), and functions read Supabase's own keys from the
environment (new `sb_` keys preferred, legacy keys as fallback).

Register the webhook with Luma (idempotent; the token never leaves Supabase):

```sql
select net.http_post(
  url := 'https://xmwyrppnznisdhmervye.supabase.co/functions/v1/luma-sync',
  headers := jsonb_build_object('content-type', 'application/json',
    'x-internal-token', public.internal_secret('internal_cron_token')),
  body := '{"action":"register_webhook"}'::jsonb);
```

Hourly backfill:

```sql
select cron.schedule('luma-sync-all', '7 * * * *', $$
  select net.http_post(
    url := 'https://xmwyrppnznisdhmervye.supabase.co/functions/v1/luma-sync',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-internal-token', public.internal_secret('internal_cron_token')),
    body := '{"action":"sync_all"}'::jsonb,
    timeout_milliseconds := 120000)
$$);
```

Read-only check of a real event (prints shapes and counts, no personal data):
`LUMA_API_KEY=... pnpm --filter @nt/shared luma:smoke evt-...`

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `LUMA_MODE` | Edge function secrets | `mock` (default) or `live` |
| `LUMA_API_KEY` | Edge function secrets **only** | Luma API key (Luma Plus). Never in app env. |
| `LUMA_WEBHOOK_TOKEN` | Edge function secrets (optional) | Overrides the Vault-generated webhook token |
| `SYNC_TIME_BUDGET_MS` | Edge function secrets (optional) | Per-call sync budget, default 100000 |
| `DATABASE_URL` | Local / CI | Postgres for the RLS test suite |
