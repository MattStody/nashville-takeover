# Architectural decisions

Newest first. Each entry: decision, then why.

## 2026-10-10 · Phase 1 (foundation)

**New repository, separate from agency-os.** Nothing is shared with the
existing agency-os app, and keeping them apart avoids breaking its Vercel
deploy.

**Guest is not a stored role.** A user is a guest for an event when a guest row
for that event is linked to their account. Staff and manager are per-event
(`staff_assignments`). Admin is a global flag on `profiles`. This keeps "who is
a guest" in sync with Luma automatically.

**Tickets are linked by confirmed email, in the database.** A trigger on
`auth.users` links every guest row with a matching email across all events
when the email is confirmed. A trigger on `guests` links rows synced after the
account exists. Changing an account's email unlinks rows that no longer match.
`link_my_guests()` is an idempotent RPC the apps call after sign-in. Unconfirmed
emails never link, so nobody can claim tickets by signing up with someone
else's address.

**Emails are lowercased `text`, not `citext`.** Supabase installs extensions
into the `extensions` schema while plain Postgres uses `public`, which breaks
`search_path = ''` functions. Emails are normalised by trigger and checked by
constraint instead.

**Check-ins and redemptions are append-only and written only through RPCs.**
`record_check_in`, `undo_check_in`, `record_perk_redemption` and `adjust_perk`
are `security definer` functions that check permissions, validate the ticket,
lock the ticket row and write the audit log. Direct INSERT/UPDATE/DELETE on
these tables is revoked from app roles, whatever RLS says.

**Idempotency via client-generated `op_id`.** Every operation carries a UUID
generated on the device. Replaying an op returns the original result without
re-validating, so a retry after success never fails and never double-counts.
Reusing an op_id for a different ticket or perk is an error.

**Conflicts are resolved by derivation, not by stored flags.** The effective
check-in is the earliest non-undone scan by device time, with `op_id` breaking
ties (`ticket_check_in_status` view). Over-limit redemptions are computed by a
running balance in the same order (`perk_redemption_ledger` view). Because
nothing depends on arrival order, every device converges on the same answer
whatever order offline queues sync in. Device clocks ahead of the server are
clamped to server time.

**Offline over-limit redemptions are accepted and flagged** (approved by
product). An offline redemption has already happened at the bar, so rejecting
it at sync would only hide it. Online redemptions past the allowance are
rejected (`perk_exhausted`). The time window is checked against scan time for
both.

**Balances are derived, never stored.** `ticket_perk_balances` = mapped
allowance − sum of redemption quantities. Manager adjustments are ledger rows
with a required reason (negative quantity gives units back).

**Audit log.** RPCs write explicit audit rows (actor, device, reason). Tables
managers edit directly (events, perks, mappings, content, sponsors,
notifications, staff assignments) have a generic audit trigger. `audit_log.event_id`
has no FK so audit rows survive event deletion.

**Composite foreign keys keep data inside one event.** Tickets, mappings and
ledgers reference `(id, event_id)`, so a ticket type, perk or ticket from one
event can never be attached to another event, even by an admin.

**No financial data, enforced three ways.** No such columns exist. Luma zod
schemas strip unknown keys at the adapter boundary. A test fails if any public
column name looks financial (price, amount, currency, fee, …). Webhook bodies
are never stored; `luma_webhook_receipts` holds identifiers only.

**Managers cannot create events or change staff.** Only admins create and
delete events and manage `staff_assignments`. Managers edit their assigned
events, perks, content and notifications. Ticket types, guests and tickets are
written only by the Luma sync (service role); managers may hide or reorder
ticket types.

**Published events are visible to every signed-in user.** Lineup, info and
sponsors are public event content. Drafts are visible only to the event's staff.
Anonymous users see nothing; the apps require sign-in.

**Mock Luma adapter behind one interface.** `LumaAdapter` exposes normalised
types, not raw Luma payloads. `LUMA_MODE=mock` (the default) uses a
deterministic in-memory dataset; `live` arrives in Phase 2. `supabase/seed.sql`
is generated from the same dataset (`pnpm seed:generate`) and a test fails if
it drifts, so the database seed and the mock API always agree.

**Shared code is Deno-compatible.** `packages/shared` uses explicit `.ts`
imports and no Node APIs in `src/`, so Supabase edge functions can import it
directly. Bare `zod` is mapped via the functions' import map.

**RLS tests run on Vitest + `pg`, not pgTAP.** pgTAP isn't installable in the
build environment, and plain TypeScript tests share tooling with the rest of
the repo. A small shim (`supabase/tests/helpers/supabase-shim.sql`) emulates
Supabase's `auth` schema and roles, so tests run on any Postgres 15+ (CI uses a
`postgres:17` service). Each test runs in a rolled-back transaction and
switches role with `set local role` + JWT claims, exactly like PostgREST.

**Generated DB types later.** Hand-written domain types live in
`packages/shared/src/types/domain.ts`. `supabase gen types` output is added
once the Supabase project is linked (Phase 3), when the apps start querying.
