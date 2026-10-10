-- Luma sync: service-role-only upserts used by the luma-sync and luma-webhook
-- edge functions, QR key resolution, and a role helper for the apps.

-- ---------------------------------------------------------------------------
-- Key aliases
-- ---------------------------------------------------------------------------

-- Luma's API never returns ticket keys, but guests/get accepts one. When a scan
-- with an unknown key is resolved online, the key is remembered here so the
-- next scan (including offline) resolves locally. ticket_id is set only when
-- the key is known to belong to one ticket.
create table public.luma_key_aliases (
  key text primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid not null,
  ticket_id uuid,
  created_at timestamptz not null default now(),
  foreign key (guest_id, event_id) references public.guests (id, event_id) on delete cascade,
  foreign key (ticket_id, event_id) references public.tickets (id, event_id) on delete cascade
);

create index luma_key_aliases_event_idx on public.luma_key_aliases (event_id);

alter table public.luma_key_aliases enable row level security;
create policy luma_key_aliases_select on public.luma_key_aliases for select to authenticated
  using (private.is_event_staff(event_id));
revoke insert, update, delete on table public.luma_key_aliases from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role helper
-- ---------------------------------------------------------------------------

-- The caller's effective role for an event: admin, manager, staff, guest, or
-- null. Used by edge functions and the apps to choose what to show; RLS still
-- enforces every read and write.
create function public.my_event_role(p_event_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when private.is_admin() then 'admin'
    else coalesce(
      (select sa.role::text from public.staff_assignments sa
        where sa.user_id = auth.uid() and sa.event_id = p_event_id),
      (select 'guest' from public.guests g
        where g.user_id = auth.uid() and g.event_id = p_event_id limit 1)
    )
  end;
$$;

revoke execute on function public.my_event_role(uuid) from public, anon;
grant execute on function public.my_event_role(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Upserts (service role only)
-- ---------------------------------------------------------------------------

-- p_types: [{ "id", "name", "isHidden" }] (normalised LumaTicketType).
-- New types take Luma's hidden flag; existing types only get their name
-- refreshed, so a manager's hide/reorder choices survive syncs.
create function public.luma_upsert_ticket_types(p_event_id uuid, p_types jsonb)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.ticket_types (event_id, luma_ticket_type_id, name, is_hidden, sort_order)
  select p_event_id, e.v ->> 'id', e.v ->> 'name', coalesce((e.v ->> 'isHidden')::boolean, false), e.ord::int - 1
  from jsonb_array_elements(p_types) with ordinality as e(v, ord)
  on conflict (event_id, luma_ticket_type_id) do update
    set name = excluded.name
    where public.ticket_types.name is distinct from excluded.name;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- p_guests: [LumaGuest] with tickets [{ "id", "ticketTypeId", "ticketTypeName" }].
-- The payload is the guest's full current state: tickets Luma no longer lists
-- are marked invalidated (never deleted, so check-in history survives).
create function public.luma_upsert_guests(p_event_id uuid, p_guests jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  g jsonb;
  t jsonb;
  v_guest_id uuid;
  v_type_id uuid;
  v_ticket_ids text[];
  v_guests int := 0;
  v_tickets int := 0;
begin
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  for g in select value from jsonb_array_elements(p_guests) loop
    if g ->> 'id' is null or g ->> 'guestKey' is null or g ->> 'email' is null then
      raise exception 'invalid_guest_payload' using errcode = '22023', detail = left(g::text, 200);
    end if;

    v_guest_id := null;
    insert into public.guests (event_id, luma_guest_id, guest_key, name, email, approval_status)
    values (p_event_id, g ->> 'id', g ->> 'guestKey', g ->> 'name', lower(g ->> 'email'), g ->> 'approvalStatus')
    on conflict (event_id, luma_guest_id) do update
      set guest_key = excluded.guest_key,
          name = excluded.name,
          email = excluded.email,
          approval_status = excluded.approval_status
      where (public.guests.guest_key, public.guests.name, public.guests.email, public.guests.approval_status)
        is distinct from (excluded.guest_key, excluded.name, excluded.email, excluded.approval_status)
    returning id into v_guest_id;

    if v_guest_id is null then
      select id into v_guest_id from public.guests
      where event_id = p_event_id and luma_guest_id = g ->> 'id';
    end if;

    v_ticket_ids := '{}';
    for t in select value from jsonb_array_elements(coalesce(g -> 'tickets', '[]'::jsonb)) loop
      select id into v_type_id from public.ticket_types
      where event_id = p_event_id and luma_ticket_type_id = t ->> 'ticketTypeId';

      if v_type_id is null then
        -- Webhooks can arrive before the first backfill has synced types.
        insert into public.ticket_types (event_id, luma_ticket_type_id, name)
        values (p_event_id, t ->> 'ticketTypeId', coalesce(nullif(t ->> 'ticketTypeName', ''), 'Ticket'))
        on conflict (event_id, luma_ticket_type_id) do nothing
        returning id into v_type_id;
        if v_type_id is null then
          select id into v_type_id from public.ticket_types
          where event_id = p_event_id and luma_ticket_type_id = t ->> 'ticketTypeId';
        end if;
      end if;

      insert into public.tickets (event_id, guest_id, ticket_type_id, luma_ticket_id, status)
      values (p_event_id, v_guest_id, v_type_id, t ->> 'id', 'active')
      on conflict (luma_ticket_id) do update
        set guest_id = excluded.guest_id,
            ticket_type_id = excluded.ticket_type_id,
            status = 'active'
        where (public.tickets.guest_id, public.tickets.ticket_type_id, public.tickets.status)
          is distinct from (excluded.guest_id, excluded.ticket_type_id, 'active');

      v_ticket_ids := v_ticket_ids || (t ->> 'id');
      v_tickets := v_tickets + 1;
    end loop;

    update public.tickets
    set status = 'invalidated'
    where guest_id = v_guest_id
      and status <> 'invalidated'
      and not (luma_ticket_id = any (v_ticket_ids));

    v_guests := v_guests + 1;
  end loop;

  return jsonb_build_object('guests', v_guests, 'tickets', v_tickets);
end;
$$;

-- Remembers an online-resolved key. p_luma_ticket_id is null when the key
-- matched a guest with several tickets and the exact ticket is unknown.
create function public.luma_record_key_alias(
  p_event_id uuid, p_key text, p_luma_guest_id text, p_luma_ticket_id text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_guest_id uuid;
  v_ticket_id uuid;
begin
  select id into v_guest_id from public.guests
  where event_id = p_event_id and luma_guest_id = p_luma_guest_id;
  if v_guest_id is null then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;

  if p_luma_ticket_id is not null then
    select id into v_ticket_id from public.tickets
    where luma_ticket_id = p_luma_ticket_id and guest_id = v_guest_id;
    if v_ticket_id is not null then
      update public.tickets set ticket_key = p_key
      where id = v_ticket_id and ticket_key is null;
    end if;
  end if;

  insert into public.luma_key_aliases (key, event_id, guest_id, ticket_id)
  values (p_key, p_event_id, v_guest_id, v_ticket_id)
  on conflict (key) do update set guest_id = excluded.guest_id, ticket_id = excluded.ticket_id;
end;
$$;

revoke execute on function
  public.luma_upsert_ticket_types(uuid, jsonb),
  public.luma_upsert_guests(uuid, jsonb),
  public.luma_record_key_alias(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.luma_upsert_ticket_types(uuid, jsonb),
  public.luma_upsert_guests(uuid, jsonb),
  public.luma_record_key_alias(uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- QR key resolution (staff)
-- ---------------------------------------------------------------------------

-- Resolves the pk of a Luma check-in QR to tickets of one event. A guest key
-- returns every ticket on the registration; a ticket key returns one ticket if
-- known, else every ticket of the guest it belongs to. No rows = unknown key
-- (the scanner then asks luma-resolve-key while online).
create function public.resolve_check_in_key(p_event_id uuid, p_key text)
returns table (ticket_id uuid, guest_id uuid, matched_by text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_event_staff(p_event_id) then
    raise exception 'not_event_staff' using errcode = '42501';
  end if;

  return query
  select t.id, t.guest_id, 'guest_key'::text
  from public.guests g join public.tickets t on t.guest_id = g.id
  where g.event_id = p_event_id and g.guest_key = p_key;
  if found then return; end if;

  return query
  select t.id, t.guest_id, 'ticket_key'::text
  from public.tickets t
  where t.event_id = p_event_id and (t.ticket_key = p_key or t.luma_ticket_id = p_key);
  if found then return; end if;

  return query
  select t.id, t.guest_id, 'alias'::text
  from public.luma_key_aliases a
  join public.tickets t on t.guest_id = a.guest_id and (a.ticket_id is null or t.id = a.ticket_id)
  where a.event_id = p_event_id and a.key = p_key;
end;
$$;

revoke execute on function public.resolve_check_in_key(uuid, text) from public, anon;
grant execute on function public.resolve_check_in_key(uuid, text) to authenticated, service_role;
