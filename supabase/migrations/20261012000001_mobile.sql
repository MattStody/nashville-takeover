-- Phase 4 (guest app): push token registration.
--
-- Registering a token only records where a future notification could go.
-- Nothing sends to it until guest contact is switched on for launch.

-- A device's token can move between accounts (sign out, sign in as someone
-- else), which plain RLS upserts can't do because the old row belongs to the
-- other user. This function reassigns it to the caller.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;

  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
