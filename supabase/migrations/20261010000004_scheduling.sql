-- Extensions for the scheduled Luma backfill (pg_cron calls luma-sync through
-- pg_net). Guarded so migrations still apply on plain Postgres in tests.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end;
$$;
