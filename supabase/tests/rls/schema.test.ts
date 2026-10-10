import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { createMigratedDatabase } from '../helpers/global-setup.ts';
import { useTestDb } from '../helpers/db.ts';

const getDb = useTestDb();

describe('schema guardrails', () => {
  it('has no column that could hold financial data', async () => {
    const rows = await getDb().sql(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and column_name ~* '(^|_)(price|prices|amount|currency|cents|payment|card|order|orders|total|fee|fees|tax|refund|coupon|discount|charge|stripe|paid)(_|$)'
         and column_name not in ('sort_order')`,
    );
    expect(rows).toEqual([]);
  });

  it('enables RLS on every public table', async () => {
    const rows = await getDb().sql(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});

describe('seed.sql', () => {
  it.skipIf(inject('supabaseManaged'))('loads cleanly and links the demo guest', async () => {
    const url = await createMigratedDatabase(inject('adminUrl'), 'nt_seed_check');
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    try {
      await db.query(readFileSync(join(import.meta.dirname, '..', '..', 'seed.sql'), 'utf8'));
      const { rows } = await db.query(`
        select
          (select count(*)::int from public.events) as events,
          (select count(*)::int from public.guests) as guests,
          (select count(*)::int from public.tickets) as tickets,
          (select count(*)::int from public.ticket_type_perks) as mappings,
          (select count(*)::int from public.guests g join auth.users u on u.id = g.user_id
             where u.email = 'guest@example.com') as demo_guest_links,
          (select count(*)::int from public.profiles where is_admin) as admins`);
      expect(rows[0]).toMatchObject({ events: 3, demo_guest_links: 2, admins: 1 });
      expect(rows[0].guests).toBeGreaterThan(100);
      expect(rows[0].tickets).toBeGreaterThan(rows[0].guests);
      expect(rows[0].mappings).toBeGreaterThan(5);
    } finally {
      await db.end();
    }
  });
});
