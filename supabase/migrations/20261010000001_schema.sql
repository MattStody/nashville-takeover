-- Nashville Takeover: core schema.
--
-- Hard rule: no financial data. No column in this schema stores prices,
-- amounts, currency, card or order details. Ticket types carry a name only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.event_status as enum ('draft', 'published', 'archived');
create type public.staff_role as enum ('staff', 'manager');
create type public.op_source as enum ('online', 'offline', 'manual');
create type public.redemption_kind as enum ('redeem', 'adjust');
create type public.content_kind as enum ('faq', 'info', 'map');
create type public.sync_trigger as enum ('manual', 'cron', 'webhook');
create type public.sync_status as enum ('running', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity and roles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Events and Luma-synced data
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  luma_event_id text unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Chicago',
  venue_name text,
  venue_address text,
  status public.event_status not null default 'draft',
  hero_image_path text,
  logo_path text,
  primary_color text check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.staff_assignments (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  primary key (user_id, event_id)
);

create index staff_assignments_event_idx on public.staff_assignments (event_id);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  luma_ticket_type_id text not null,
  name text not null,
  is_hidden boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, luma_ticket_type_id),
  unique (id, event_id)
);

create trigger ticket_types_updated_at before update on public.ticket_types
  for each row execute function public.set_updated_at();

-- One row per Luma registration (a "guest" in Luma terms). A registration can
-- hold several tickets.
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  luma_guest_id text not null,
  guest_key text not null unique,
  name text,
  -- Always lowercased (normalised by trigger) so matching is case-insensitive.
  email text not null check (email = lower(email)),
  approval_status text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, luma_guest_id),
  unique (id, event_id)
);

create index guests_email_idx on public.guests (email);
create index guests_user_idx on public.guests (user_id) where user_id is not null;

create trigger guests_updated_at before update on public.guests
  for each row execute function public.set_updated_at();

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  guest_id uuid not null,
  ticket_type_id uuid not null,
  ticket_key text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FKs guarantee the guest and ticket type belong to the same event.
  foreign key (guest_id, event_id) references public.guests (id, event_id) on delete cascade,
  foreign key (ticket_type_id, event_id) references public.ticket_types (id, event_id),
  unique (id, event_id)
);

create index tickets_guest_idx on public.tickets (guest_id);
create index tickets_event_idx on public.tickets (event_id);

create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Perks
-- ---------------------------------------------------------------------------

create table public.perks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  icon text,
  valid_from timestamptz,
  valid_until timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create trigger perks_updated_at before update on public.perks
  for each row execute function public.set_updated_at();

create table public.ticket_type_perks (
  ticket_type_id uuid not null,
  perk_id uuid not null,
  event_id uuid not null,
  quantity int not null check (quantity > 0),
  primary key (ticket_type_id, perk_id),
  foreign key (ticket_type_id, event_id) references public.ticket_types (id, event_id) on delete cascade,
  foreign key (perk_id, event_id) references public.perks (id, event_id) on delete cascade
);

create index ticket_type_perks_perk_idx on public.ticket_type_perks (perk_id);

-- ---------------------------------------------------------------------------
-- Operations (append-only ledgers; written only through RPCs)
-- ---------------------------------------------------------------------------

-- Every scan is recorded, including duplicates. The effective check-in for a
-- ticket is derived (see ticket_check_in_status), never stored, so the result
-- does not depend on the order offline devices sync in.
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  op_id uuid not null unique,
  ticket_id uuid not null,
  event_id uuid not null,
  staff_user_id uuid not null references auth.users (id),
  device_id text,
  source public.op_source not null,
  scanned_at timestamptz not null,
  received_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references auth.users (id),
  undo_reason text,
  luma_synced_at timestamptz,
  foreign key (ticket_id, event_id) references public.tickets (id, event_id) on delete cascade,
  check ((undone_at is null) = (undone_by is null)),
  check (undone_at is null or length(trim(coalesce(undo_reason, ''))) > 0)
);

create index check_ins_ticket_idx on public.check_ins (ticket_id, scanned_at, op_id);
create index check_ins_event_idx on public.check_ins (event_id, received_at);

-- quantity = units consumed. A redeem consumes (> 0). An adjust can consume
-- (> 0) or give units back (< 0) and always needs a reason.
create table public.perk_redemptions (
  id uuid primary key default gen_random_uuid(),
  op_id uuid not null unique,
  ticket_id uuid not null,
  perk_id uuid not null,
  event_id uuid not null,
  kind public.redemption_kind not null,
  quantity int not null check (quantity <> 0),
  reason text,
  staff_user_id uuid not null references auth.users (id),
  device_id text,
  source public.op_source not null,
  scanned_at timestamptz not null,
  received_at timestamptz not null default now(),
  foreign key (ticket_id, event_id) references public.tickets (id, event_id) on delete cascade,
  foreign key (perk_id, event_id) references public.perks (id, event_id) on delete cascade,
  check (kind <> 'redeem' or quantity > 0),
  check (kind <> 'adjust' or length(trim(coalesce(reason, ''))) > 0)
);

create index perk_redemptions_ticket_perk_idx
  on public.perk_redemptions (ticket_id, perk_id, scanned_at, op_id);
create index perk_redemptions_event_idx on public.perk_redemptions (event_id, received_at);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

create table public.lineup_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  artist text not null,
  stage text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  description text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index lineup_items_event_idx on public.lineup_items (event_id, starts_at);

create trigger lineup_items_updated_at before update on public.lineup_items
  for each row execute function public.set_updated_at();

create table public.lineup_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  lineup_item_id uuid not null references public.lineup_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lineup_item_id)
);

create table public.event_content (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind public.content_kind not null,
  title text not null,
  body text,
  image_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_content_event_idx on public.event_content (event_id, kind, sort_order);

create trigger event_content_updated_at before update on public.event_content
  for each row execute function public.set_updated_at();

create table public.sponsor_activations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sponsor_name text not null,
  logo_path text,
  description text,
  location text,
  cta_url text check (cta_url is null or cta_url ~ '^https://'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sponsor_activations_event_idx on public.sponsor_activations (event_id, sort_order);

create trigger sponsor_activations_updated_at before update on public.sponsor_activations
  for each row execute function public.set_updated_at();

create table public.sponsor_views (
  id bigint generated always as identity primary key,
  sponsor_activation_id uuid not null references public.sponsor_activations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index sponsor_views_activation_idx on public.sponsor_views (sponsor_activation_id, viewed_at);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  body text not null,
  -- null = every guest of the event; otherwise only these ticket types.
  audience_ticket_type_ids uuid[],
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  check (audience_ticket_type_ids is null or cardinality(audience_ticket_type_ids) > 0)
);

create index notifications_event_idx on public.notifications (event_id, sent_at desc);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Sync bookkeeping and audit
-- ---------------------------------------------------------------------------

create table public.luma_sync_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  trigger public.sync_trigger not null,
  status public.sync_status not null default 'running',
  started_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  guests_upserted int not null default 0,
  tickets_upserted int not null default 0,
  error text
);

create index luma_sync_runs_event_idx on public.luma_sync_runs (event_id, started_at desc);

-- Only identifiers are kept, never webhook bodies.
create table public.luma_webhook_receipts (
  delivery_id text primary key,
  event_type text not null,
  luma_event_id text,
  received_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  -- No FK: audit rows must outlive (and be writable during) event deletion.
  event_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  device_id text
);

create index audit_log_event_idx on public.audit_log (event_id, at desc);
