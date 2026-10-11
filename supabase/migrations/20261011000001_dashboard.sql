-- Phase 3 (dashboard): entry vs add-on ticket types, staff invites, media
-- storage, and audit coverage for the remaining manager/admin edits.

-- ---------------------------------------------------------------------------
-- Ticket types that admit entry
-- ---------------------------------------------------------------------------

-- Add-ons such as "After Party Upgrade" are tickets in Luma but do not get
-- anyone through the gate. They still unlock perks; they cannot be checked in.
alter table public.ticket_types add column admits_entry boolean not null default true;

create or replace function public.record_check_in(
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

    if not (select tt.admits_entry from public.ticket_types tt where tt.id = v_ticket.ticket_type_id) then
      raise exception 'ticket_not_entry' using errcode = 'P0001';
    end if;

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

-- ---------------------------------------------------------------------------
-- Staff invites
-- ---------------------------------------------------------------------------

-- Admins invite by email. An invite becomes a staff assignment (or admin
-- rights) as soon as an account with that confirmed email exists, now or
-- when the person first signs in. No email is sent by the database.
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email like '%@%'),
  event_id uuid references public.events (id) on delete cascade,
  role public.staff_role,
  make_admin boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (
    (make_admin and event_id is null and role is null)
    or (not make_admin and event_id is not null and role is not null)
  )
);

create unique index staff_invites_event_unique on public.staff_invites (email, event_id) where event_id is not null;
create unique index staff_invites_admin_unique on public.staff_invites (email) where make_admin;

alter table public.staff_invites enable row level security;
create policy staff_invites_admin_all on public.staff_invites for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create function private.apply_staff_invites(p_user_id uuid)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text;
  v_count int := 0;
  inv public.staff_invites;
begin
  select lower(u.email) into v_email from auth.users u
  where u.id = p_user_id and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  for inv in
    select * from public.staff_invites where email = v_email and accepted_at is null for update
  loop
    if inv.make_admin then
      update public.profiles set is_admin = true where id = p_user_id;
    else
      insert into public.staff_assignments (user_id, event_id, role, created_by)
      values (p_user_id, inv.event_id, inv.role, inv.invited_by)
      on conflict (user_id, event_id) do update set role = excluded.role;
    end if;
    update public.staff_invites set accepted_at = now() where id = inv.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Extend the auth trigger: link guests (existing) and apply staff invites.
create or replace function private.on_auth_user_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;

  perform private.link_guests_for_user(new.id);
  perform private.apply_staff_invites(new.id);
  return new;
end;
$$;

-- Inviting someone who already has an account takes effect immediately.
create function private.on_staff_invite_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users u
  where lower(u.email) = new.email and u.email_confirmed_at is not null;
  if v_user_id is not null then
    perform private.apply_staff_invites(v_user_id);
  end if;
  return null;
end;
$$;

create trigger staff_invites_apply after insert on public.staff_invites
  for each row execute function private.on_staff_invite_insert();

-- ---------------------------------------------------------------------------
-- Audit coverage
-- ---------------------------------------------------------------------------

create trigger staff_invites_audit after insert or update or delete on public.staff_invites
  for each row execute function private.audit_row_change();

-- Only edits made by a signed-in user are audited here; Luma syncs (no user)
-- would otherwise flood the log with name refreshes.
create trigger ticket_types_audit after update on public.ticket_types
  for each row when (auth.uid() is not null)
  execute function private.audit_row_change();

create trigger profiles_audit after update on public.profiles
  for each row when (old.is_admin is distinct from new.is_admin)
  execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Media storage (Supabase Storage; skipped on plain Postgres)
-- ---------------------------------------------------------------------------

create function private.try_uuid(p_text text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function private.try_uuid(text) to authenticated, service_role;

-- Public bucket for event images (hero, logos, lineup, map, sponsors). Paths
-- are "<event_id>/<kind>/<file>"; only that event's managers can write.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('event-media', 'event-media', true, 5242880,
            array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
    on conflict (id) do nothing;

    execute $p$
      create policy event_media_manager_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'event-media'
          and private.is_event_manager(private.try_uuid((storage.foldername(name))[1])))
    $p$;
    execute $p$
      create policy event_media_manager_update on storage.objects for update to authenticated
        using (bucket_id = 'event-media'
          and private.is_event_manager(private.try_uuid((storage.foldername(name))[1])))
    $p$;
    execute $p$
      create policy event_media_manager_delete on storage.objects for delete to authenticated
        using (bucket_id = 'event-media'
          and private.is_event_manager(private.try_uuid((storage.foldername(name))[1])))
    $p$;
  end if;
end;
$$;
