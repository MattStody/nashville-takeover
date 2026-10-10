-- Access control: role helpers, guest/ticket linking, RLS policies, derived
-- views, and the RPCs that are the only write path for operational ledgers.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------

create function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create function private.is_event_staff(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.staff_assignments sa
    where sa.user_id = auth.uid() and sa.event_id = p_event_id
  );
$$;

create function private.is_event_manager(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.staff_assignments sa
    where sa.user_id = auth.uid() and sa.event_id = p_event_id and sa.role = 'manager'
  );
$$;

-- Published events are readable by any signed-in user; drafts and archived
-- events only by that event's staff.
create function private.can_view_event(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.status = 'published'
  ) or private.is_event_staff(p_event_id);
$$;

create function private.my_guest_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select g.id from public.guests g where g.user_id = auth.uid();
$$;

create function private.my_ticket_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select t.id from public.tickets t
  join public.guests g on g.id = t.guest_id
  where g.user_id = auth.uid();
$$;

-- True when the caller and p_user_id are both assigned to some common event.
create function private.shares_event_with(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_assignments mine
    join public.staff_assignments theirs on theirs.event_id = mine.event_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

-- Ticket type ids the caller holds for an event (for notification audiences).
create function private.my_ticket_type_ids(p_event_id uuid)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct t.ticket_type_id), '{}')
  from public.tickets t
  join public.guests g on g.id = t.guest_id
  where g.user_id = auth.uid() and t.event_id = p_event_id;
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profiles and guest linking
-- ---------------------------------------------------------------------------

-- Links every guest record whose email matches the user's *confirmed* email,
-- across all events, and unlinks records that no longer match (email change).
create function private.link_guests_for_user(p_user_id uuid)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text;
  v_linked int;
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = p_user_id and u.email_confirmed_at is not null;

  update public.guests g set user_id = null
  where g.user_id = p_user_id and (v_email is null or g.email <> v_email);

  if v_email is null then
    return 0;
  end if;

  update public.guests g set user_id = p_user_id
  where g.email = v_email and g.user_id is distinct from p_user_id;
  get diagnostics v_linked = row_count;
  return v_linked;
end;
$$;

create function private.on_auth_user_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;

  perform private.link_guests_for_user(new.id);
  return new;
end;
$$;

create trigger on_auth_user_change
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.on_auth_user_change();

-- Synced guests are linked to an existing account as soon as they arrive.
create function private.guest_link_on_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  if tg_op = 'INSERT' or new.email is distinct from old.email then
    select u.id into new.user_id
    from auth.users u
    where lower(u.email) = new.email and u.email_confirmed_at is not null
    limit 1;
  end if;
  return new;
end;
$$;

create trigger guests_link_on_write
  before insert or update of email on public.guests
  for each row execute function private.guest_link_on_write();

-- Called by the apps right after sign-in. Idempotent.
create function public.link_my_guests()
returns int
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return private.link_guests_for_user(auth.uid());
end;
$$;

-- Users may edit their display name only. is_admin and email are changed by
-- admins or by the system (security definer functions run as the owner).
create function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_admin() then
    if new.is_admin is distinct from old.is_admin or new.email is distinct from old.email then
      raise exception 'profile_field_not_editable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Audit trigger for tables managers edit directly
-- ---------------------------------------------------------------------------

create function private.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_id, event_id, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    case when tg_table_name = 'events' then (v_row ->> 'id')::uuid
         else (v_row ->> 'event_id')::uuid end,
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'perk_id', v_row ->> 'user_id'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'events', 'staff_assignments', 'perks', 'ticket_type_perks', 'lineup_items',
    'event_content', 'sponsor_activations', 'notifications'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.ticket_types enable row level security;
alter table public.guests enable row level security;
alter table public.tickets enable row level security;
alter table public.perks enable row level security;
alter table public.ticket_type_perks enable row level security;
alter table public.check_ins enable row level security;
alter table public.perk_redemptions enable row level security;
alter table public.lineup_items enable row level security;
alter table public.lineup_favorites enable row level security;
alter table public.event_content enable row level security;
alter table public.sponsor_activations enable row level security;
alter table public.sponsor_views enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_reads enable row level security;
alter table public.luma_sync_runs enable row level security;
alter table public.luma_webhook_receipts enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin() or private.shares_event_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_admin())
  with check (id = (select auth.uid()) or private.is_admin());

-- events
create policy events_select on public.events for select to authenticated
  using (private.can_view_event(id));
create policy events_insert on public.events for insert to authenticated
  with check (private.is_admin());
create policy events_update on public.events for update to authenticated
  using (private.is_event_manager(id)) with check (private.is_event_manager(id));
create policy events_delete on public.events for delete to authenticated
  using (private.is_admin());

-- staff_assignments (admin manages; members see their event's team)
create policy staff_assignments_select on public.staff_assignments for select to authenticated
  using (user_id = (select auth.uid()) or private.is_event_manager(event_id));
create policy staff_assignments_admin_write on public.staff_assignments for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ticket_types (synced by the service role; managers may only hide/reorder)
create policy ticket_types_select on public.ticket_types for select to authenticated
  using (private.can_view_event(event_id));
create policy ticket_types_update on public.ticket_types for update to authenticated
  using (private.is_event_manager(event_id)) with check (private.is_event_manager(event_id));

-- guests / tickets (synced by the service role; read-only to users)
create policy guests_select on public.guests for select to authenticated
  using (user_id = (select auth.uid()) or private.is_event_staff(event_id));
create policy tickets_select on public.tickets for select to authenticated
  using (id in (select private.my_ticket_ids()) or private.is_event_staff(event_id));

-- perks and mapping
create policy perks_select on public.perks for select to authenticated
  using (private.can_view_event(event_id));
create policy perks_manager_write on public.perks for all to authenticated
  using (private.is_event_manager(event_id)) with check (private.is_event_manager(event_id));
create policy ticket_type_perks_select on public.ticket_type_perks for select to authenticated
  using (private.can_view_event(event_id));
create policy ticket_type_perks_manager_write on public.ticket_type_perks for all to authenticated
  using (private.is_event_manager(event_id)) with check (private.is_event_manager(event_id));

-- ledgers: read-only through RLS; writes go through RPCs below
create policy check_ins_select on public.check_ins for select to authenticated
  using (ticket_id in (select private.my_ticket_ids()) or private.is_event_staff(event_id));
create policy perk_redemptions_select on public.perk_redemptions for select to authenticated
  using (ticket_id in (select private.my_ticket_ids()) or private.is_event_staff(event_id));

-- content
create policy lineup_items_select on public.lineup_items for select to authenticated
  using (private.can_view_event(event_id));
create policy lineup_items_manager_write on public.lineup_items for all to authenticated
  using (private.is_event_manager(event_id)) with check (private.is_event_manager(event_id));
create policy event_content_select on public.event_content for select to authenticated
  using (private.can_view_event(event_id));
create policy event_content_manager_write on public.event_content for all to authenticated
  using (private.is_event_manager(event_id)) with check (private.is_event_manager(event_id));
create policy sponsor_activations_select on public.sponsor_activations for select to authenticated
  using (private.can_view_event(event_id));
create policy sponsor_activations_manager_write on public.sponsor_activations for all to authenticated
  using (private.is_event_manager(event_id)) with check (private.is_event_manager(event_id));

create policy lineup_favorites_own on public.lineup_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.lineup_items li where li.id = lineup_item_id)
  );

create policy sponsor_views_insert_own on public.sponsor_views for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.sponsor_activations sa where sa.id = sponsor_activation_id)
  );
create policy sponsor_views_select on public.sponsor_views for select to authenticated
  using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.sponsor_activations sa
      where sa.id = sponsor_activation_id and private.is_event_manager(sa.event_id)
    )
  );

-- notifications: guests see sent ones addressed to a ticket type they hold
create policy notifications_guest_select on public.notifications for select to authenticated
  using (
    sent_at is not null
    and exists (
      select 1 from public.guests g
      where g.user_id = (select auth.uid()) and g.event_id = notifications.event_id
    )
    and (
      audience_ticket_type_ids is null
      or audience_ticket_type_ids && private.my_ticket_type_ids(event_id)
    )
  );
create policy notifications_manager_all on public.notifications for all to authenticated
  using (private.is_event_manager(event_id)) with check (private.is_event_manager(event_id));

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_reads_own on public.notification_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- sync bookkeeping and audit: read-only to managers/admins
create policy luma_sync_runs_select on public.luma_sync_runs for select to authenticated
  using (private.is_event_manager(event_id));
create policy audit_log_select on public.audit_log for select to authenticated
  using (private.is_admin() or (event_id is not null and private.is_event_manager(event_id)));
-- luma_webhook_receipts: no policies; service role only.

-- Defence in depth: no direct writes to synced data or ledgers, whatever the
-- policies say.
revoke all on table public.luma_webhook_receipts from anon, authenticated;
revoke insert, update, delete on table
  public.guests, public.tickets, public.check_ins, public.perk_redemptions,
  public.audit_log, public.luma_sync_runs
  from anon, authenticated;
revoke insert, delete on table public.ticket_types from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Derived views (security_invoker so the caller's RLS applies)
-- ---------------------------------------------------------------------------

-- The effective check-in is the earliest non-undone scan (op_id breaks ties),
-- so every device converges on the same answer regardless of sync order.
create view public.ticket_check_in_status with (security_invoker = true) as
select
  t.id as ticket_id,
  t.event_id,
  eff.id as check_in_id,
  eff.scanned_at as checked_in_at,
  eff.staff_user_id as checked_in_by,
  eff.device_id as checked_in_device_id,
  eff.source as checked_in_source,
  (select count(*) from public.check_ins c
    where c.ticket_id = t.id and c.undone_at is null)::int as scan_count
from public.tickets t
left join lateral (
  select c.* from public.check_ins c
  where c.ticket_id = t.id and c.undone_at is null
  order by c.scanned_at, c.op_id
  limit 1
) eff on true;

create view public.ticket_perk_balances with (security_invoker = true) as
select
  t.id as ticket_id,
  t.event_id,
  p.id as perk_id,
  p.name as perk_name,
  p.valid_from,
  p.valid_until,
  ttp.quantity as allowance,
  coalesce(sum(r.quantity), 0)::int as used,
  (ttp.quantity - coalesce(sum(r.quantity), 0))::int as remaining
from public.tickets t
join public.ticket_type_perks ttp on ttp.ticket_type_id = t.ticket_type_id
join public.perks p on p.id = ttp.perk_id
left join public.perk_redemptions r on r.ticket_id = t.id and r.perk_id = p.id
group by t.id, t.event_id, p.id, p.name, p.valid_from, p.valid_until, ttp.quantity;

-- Running balance per (ticket, perk) in deterministic order. A redeem that
-- drives the balance below zero is flagged over_limit (possible only for
-- offline redemptions, which are accepted because the perk was handed over).
create view public.perk_redemption_ledger with (security_invoker = true) as
select
  r.*,
  (coalesce(ttp.quantity, 0) - sum(r.quantity) over w)::int as balance_after,
  (r.kind = 'redeem' and coalesce(ttp.quantity, 0) - sum(r.quantity) over w < 0) as over_limit
from public.perk_redemptions r
join public.tickets t on t.id = r.ticket_id
left join public.ticket_type_perks ttp
  on ttp.ticket_type_id = t.ticket_type_id and ttp.perk_id = r.perk_id
window w as (
  partition by r.ticket_id, r.perk_id
  order by r.scanned_at, r.op_id
  rows between unbounded preceding and current row
);

grant select on public.ticket_check_in_status, public.ticket_perk_balances,
  public.perk_redemption_ledger to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs: the only write path for check-ins and redemptions
-- ---------------------------------------------------------------------------

create function private.audit(
  p_event_id uuid, p_action text, p_entity text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_reason text default null, p_device_id text default null
)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, event_id, action, entity, entity_id, before, after, reason, device_id)
  values (auth.uid(), p_event_id, p_action, p_entity, p_entity_id, p_before, p_after, p_reason, p_device_id);
$$;

-- Loads a ticket for an operation and enforces that the caller may act on it.
create function private.ticket_for_op(p_ticket_id uuid, p_require_manager boolean)
returns public.tickets
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_approval text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Row lock serialises concurrent operations on the same ticket.
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;

  if p_require_manager then
    if not private.is_event_manager(v_ticket.event_id) then
      raise exception 'not_event_manager' using errcode = '42501';
    end if;
  elsif not private.is_event_staff(v_ticket.event_id) then
    raise exception 'not_event_staff' using errcode = '42501';
  end if;

  select g.approval_status into v_approval from public.guests g where g.id = v_ticket.guest_id;
  if v_ticket.status <> 'active' or v_approval <> 'approved' then
    raise exception 'ticket_not_valid' using errcode = 'P0001',
      detail = format('ticket_status=%s approval_status=%s', v_ticket.status, v_approval);
  end if;

  return v_ticket;
end;
$$;

create function public.record_check_in(
  p_op_id uuid,
  p_ticket_id uuid,
  p_scanned_at timestamptz default now(),
  p_device_id text default null,
  p_source public.op_source default 'online'
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_row public.check_ins;
  v_is_new boolean := false;
  v_status public.ticket_check_in_status;
begin
  -- Replays of an op already recorded return the original result untouched.
  select * into v_row from public.check_ins where op_id = p_op_id;
  if found then
    if v_row.ticket_id <> p_ticket_id then
      raise exception 'op_id_reused' using errcode = '23505';
    end if;
    if not private.is_event_staff(v_row.event_id) then
      raise exception 'not_event_staff' using errcode = '42501';
    end if;
  else
    v_ticket := private.ticket_for_op(p_ticket_id, p_source = 'manual');

    insert into public.check_ins (op_id, ticket_id, event_id, staff_user_id, device_id, source, scanned_at)
    values (
      p_op_id, p_ticket_id, v_ticket.event_id, auth.uid(), p_device_id, p_source,
      -- Never trust a device clock that is ahead of the server.
      least(coalesce(p_scanned_at, now()), now())
    )
    on conflict (op_id) do nothing
    returning * into v_row;

    if v_row.id is null then
      -- Lost a race with a concurrent replay of the same op.
      select * into v_row from public.check_ins where op_id = p_op_id;
    else
      v_is_new := true;
      perform private.audit(v_row.event_id, 'check_in', 'check_ins', v_row.id::text,
        null, to_jsonb(v_row), null, p_device_id);
    end if;
  end if;

  select * into v_status from public.ticket_check_in_status where ticket_id = v_row.ticket_id;

  return jsonb_build_object(
    'check_in_id', v_row.id,
    'op_id', v_row.op_id,
    'is_new', v_is_new,
    'is_effective', v_status.check_in_id = v_row.id,
    'checked_in_at', v_status.checked_in_at,
    'checked_in_by', v_status.checked_in_by,
    'checked_in_by_name', (select coalesce(p.display_name, p.email::text)
                             from public.profiles p where p.id = v_status.checked_in_by)
  );
end;
$$;

create function public.undo_check_in(p_check_in_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_before public.check_ins;
  v_after public.check_ins;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_before from public.check_ins where id = p_check_in_id for update;
  if not found then
    raise exception 'check_in_not_found' using errcode = 'P0002';
  end if;
  if not private.is_event_manager(v_before.event_id) then
    raise exception 'not_event_manager' using errcode = '42501';
  end if;
  if v_before.undone_at is not null then
    return; -- already undone; idempotent
  end if;

  update public.check_ins
  set undone_at = now(), undone_by = auth.uid(), undo_reason = p_reason
  where id = p_check_in_id
  returning * into v_after;

  perform private.audit(v_after.event_id, 'undo_check_in', 'check_ins', v_after.id::text,
    to_jsonb(v_before), to_jsonb(v_after), p_reason);
end;
$$;

create function private.insert_redemption(
  p_op_id uuid, p_ticket public.tickets, p_perk_id uuid, p_kind public.redemption_kind,
  p_quantity int, p_reason text, p_scanned_at timestamptz, p_device_id text,
  p_source public.op_source
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.perk_redemptions;
  v_is_new boolean := false;
  v_remaining int;
begin
  insert into public.perk_redemptions
    (op_id, ticket_id, perk_id, event_id, kind, quantity, reason, staff_user_id, device_id, source, scanned_at)
  values
    (p_op_id, p_ticket.id, p_perk_id, p_ticket.event_id, p_kind, p_quantity, p_reason,
     auth.uid(), p_device_id, p_source, p_scanned_at)
  on conflict (op_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.perk_redemptions where op_id = p_op_id;
  else
    v_is_new := true;
    perform private.audit(v_row.event_id, 'perk_' || p_kind::text, 'perk_redemptions', v_row.id::text,
      null, to_jsonb(v_row), p_reason, p_device_id);
  end if;

  select b.remaining into v_remaining from public.ticket_perk_balances b
  where b.ticket_id = v_row.ticket_id and b.perk_id = v_row.perk_id;

  return jsonb_build_object(
    'redemption_id', v_row.id,
    'op_id', v_row.op_id,
    'is_new', v_is_new,
    'remaining', v_remaining
  );
end;
$$;

create function private.redemption_replay(p_op_id uuid, p_ticket_id uuid, p_perk_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.perk_redemptions;
begin
  select * into v_row from public.perk_redemptions where op_id = p_op_id;
  if not found then
    return null;
  end if;
  if v_row.ticket_id <> p_ticket_id or v_row.perk_id <> p_perk_id then
    raise exception 'op_id_reused' using errcode = '23505';
  end if;
  if not private.is_event_staff(v_row.event_id) then
    raise exception 'not_event_staff' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'redemption_id', v_row.id,
    'op_id', v_row.op_id,
    'is_new', false,
    'remaining', (select b.remaining from public.ticket_perk_balances b
                  where b.ticket_id = v_row.ticket_id and b.perk_id = v_row.perk_id)
  );
end;
$$;

create function public.record_perk_redemption(
  p_op_id uuid,
  p_ticket_id uuid,
  p_perk_id uuid,
  p_quantity int default 1,
  p_scanned_at timestamptz default now(),
  p_device_id text default null,
  p_source public.op_source default 'online'
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_ticket public.tickets;
  v_perk public.perks;
  v_remaining int;
  v_at timestamptz := least(coalesce(p_scanned_at, now()), now());
begin
  v_replay := private.redemption_replay(p_op_id, p_ticket_id, p_perk_id);
  if v_replay is not null then
    return v_replay;
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  v_ticket := private.ticket_for_op(p_ticket_id, p_source = 'manual');

  select * into v_perk from public.perks where id = p_perk_id and event_id = v_ticket.event_id;
  if not found then
    raise exception 'perk_not_found' using errcode = 'P0002';
  end if;

  select b.remaining into v_remaining from public.ticket_perk_balances b
  where b.ticket_id = p_ticket_id and b.perk_id = p_perk_id;
  if v_remaining is null then
    raise exception 'perk_not_included' using errcode = 'P0001';
  end if;

  if (v_perk.valid_from is not null and v_at < v_perk.valid_from)
     or (v_perk.valid_until is not null and v_at > v_perk.valid_until) then
    raise exception 'perk_outside_window' using errcode = 'P0001';
  end if;

  -- Online scans are rejected when the balance is used up. Offline scans
  -- already happened at the gate, so they are recorded and surface as
  -- over_limit in perk_redemption_ledger.
  if p_source <> 'offline' and v_remaining < p_quantity then
    raise exception 'perk_exhausted' using errcode = 'P0001',
      detail = format('remaining=%s', v_remaining);
  end if;

  return private.insert_redemption(p_op_id, v_ticket, p_perk_id, 'redeem', p_quantity,
    null, v_at, p_device_id, p_source);
end;
$$;

-- Manager correction. Positive quantity consumes, negative gives back.
create function public.adjust_perk(
  p_op_id uuid,
  p_ticket_id uuid,
  p_perk_id uuid,
  p_quantity int,
  p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_ticket public.tickets;
begin
  v_replay := private.redemption_replay(p_op_id, p_ticket_id, p_perk_id);
  if v_replay is not null then
    return v_replay;
  end if;

  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  -- Adjustments are allowed on cancelled tickets too, so skip validity checks
  -- by loading the ticket directly after the permission check.
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  if not private.is_event_manager(v_ticket.event_id) then
    raise exception 'not_event_manager' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perks where id = p_perk_id and event_id = v_ticket.event_id) then
    raise exception 'perk_not_found' using errcode = 'P0002';
  end if;

  return private.insert_redemption(p_op_id, v_ticket, p_perk_id, 'adjust', p_quantity,
    p_reason, now(), null, 'manual');
end;
$$;

revoke execute on function
  public.link_my_guests(),
  public.record_check_in(uuid, uuid, timestamptz, text, public.op_source),
  public.undo_check_in(uuid, text),
  public.record_perk_redemption(uuid, uuid, uuid, int, timestamptz, text, public.op_source),
  public.adjust_perk(uuid, uuid, uuid, int, text)
  from public, anon;
grant execute on function
  public.link_my_guests(),
  public.record_check_in(uuid, uuid, timestamptz, text, public.op_source),
  public.undo_check_in(uuid, text),
  public.record_perk_redemption(uuid, uuid, uuid, int, timestamptz, text, public.op_source),
  public.adjust_perk(uuid, uuid, uuid, int, text)
  to authenticated, service_role;

revoke execute on all functions in schema private from public, anon;
