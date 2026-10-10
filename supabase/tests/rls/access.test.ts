import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '../helpers/db.ts';
import { buildWorld, createGuest, createUser, type World } from '../helpers/fixtures.ts';

const getDb = useTestDb();
let w: World;

beforeEach(async () => {
  w = await buildWorld(getDb());
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('guest linking', () => {
  it('links guests across events by confirmed email, case-insensitively', async () => {
    const db = getDb();
    const rows = await db.sql(`select id from public.guests where user_id = $1`, [w.users.guest1]);
    expect(ids(rows as { id: string }[])).toEqual([w.guests.g1a, w.guests.g1b].sort());
  });

  it('links guests synced after the account exists', async () => {
    const db = getDb();
    const [g] = await db.sql(`select user_id from public.guests where id = $1`, [w.guests.g2a]);
    expect(g?.user_id).toBe(w.users.guest2);
  });

  it('does not link unconfirmed emails until they are confirmed', async () => {
    const db = getDb();
    const email = `pending-${randomUUID()}@example.com`;
    const guestId = await createGuest(db, w.events.a, email);
    const userId = await createUser(db, email, { confirmed: false });

    let [g] = await db.sql(`select user_id from public.guests where id = $1`, [guestId]);
    expect(g?.user_id).toBeNull();
    expect(await db.as(userId, `select * from public.link_my_guests() as n`)).toEqual([{ n: 0 }]);

    await db.sql(`update auth.users set email_confirmed_at = now() where id = $1`, [userId]);
    [g] = await db.sql(`select user_id from public.guests where id = $1`, [guestId]);
    expect(g?.user_id).toBe(userId);
  });

  it('unlinks guests when the account email changes', async () => {
    const db = getDb();
    await db.sql(`update auth.users set email = 'someone-else@example.com' where id = $1`, [
      w.users.guest1,
    ]);
    const rows = await db.sql(`select id from public.guests where user_id = $1`, [w.users.guest1]);
    expect(rows).toHaveLength(0);
  });

  it('link_my_guests is idempotent and rejects anon', async () => {
    const db = getDb();
    expect(await db.as(w.users.guest1, `select public.link_my_guests() as n`)).toEqual([{ n: 0 }]);
    await db.expectError(null, `select public.link_my_guests()`, [], { code: '42501' });
  });
});

describe('guest role', () => {
  it('sees only their own guests and tickets', async () => {
    const db = getDb();
    const guests = await db.as(w.users.guest1, `select id from public.guests`);
    expect(ids(guests as { id: string }[])).toEqual([w.guests.g1a, w.guests.g1b].sort());
    const tickets = await db.as(w.users.guest1, `select id from public.tickets`);
    expect(ids(tickets as { id: string }[])).toEqual([w.tickets.g1aVip, w.tickets.g1bGa].sort());
    expect(await db.as(w.users.outsider, `select id from public.tickets`)).toHaveLength(0);
  });

  it('sees published events and their content, not drafts', async () => {
    const db = getDb();
    const events = await db.as(w.users.outsider, `select id from public.events where id = any($1)`, [
      Object.values(w.events),
    ]);
    expect(ids(events as { id: string }[])).toEqual([w.events.a, w.events.b].sort());
    expect(
      await db.as(w.users.guest1, `select id from public.perks where event_id = $1`, [w.events.draft]),
    ).toHaveLength(0);
  });

  it('sees own perk balances only', async () => {
    const db = getDb();
    const rows = await db.as(
      w.users.guest1,
      `select ticket_id, perk_name, remaining from public.ticket_perk_balances order by perk_name`,
    );
    expect(rows.every((r) => [w.tickets.g1aVip, w.tickets.g1bGa].includes(r.ticket_id))).toBe(true);
    expect(rows.filter((r) => r.ticket_id === w.tickets.g1aVip)).toHaveLength(3);
  });

  it('cannot write ledgers, synced data, or event config', async () => {
    const db = getDb();
    const g = w.users.guest1;
    await db.expectError(
      g,
      `insert into public.check_ins (op_id, ticket_id, event_id, staff_user_id, source, scanned_at)
       values (gen_random_uuid(), $1, $2, $3, 'online', now())`,
      [w.tickets.g1aVip, w.events.a, g],
      { code: '42501' },
    );
    await db.expectError(g, `update public.tickets set status = 'active'`, [], { code: '42501' });
    await db.expectError(g, `insert into public.perks (event_id, name) values ($1, 'Free stuff')`, [w.events.a], {
      code: '42501',
    });
    await db.expectError(
      g,
      `select public.record_check_in(gen_random_uuid(), $1)`,
      [w.tickets.g1aVip],
      { message: /not_event_staff/ },
    );
    const updated = await db.as(g, `update public.events set name = 'Hacked' returning id`);
    expect(updated).toHaveLength(0);
  });

  it('can edit display name but not promote themselves', async () => {
    const db = getDb();
    await db.as(w.users.guest1, `update public.profiles set display_name = 'Jo' where id = $1`, [w.users.guest1]);
    await db.expectError(
      w.users.guest1,
      `update public.profiles set is_admin = true where id = $1`,
      [w.users.guest1],
      { message: /profile_field_not_editable/ },
    );
    const others = await db.as(w.users.guest1, `select id from public.profiles where id <> $1`, [w.users.guest1]);
    expect(others).toHaveLength(0);
  });

  it('manages only their own favorites and push tokens', async () => {
    const db = getDb();
    const [item] = await db.sql(
      `insert into public.lineup_items (event_id, artist, stage, starts_at, ends_at)
       values ($1, 'Band', 'Main', now(), now() + interval '1 hour') returning id`,
      [w.events.a],
    );
    await db.as(w.users.guest1, `insert into public.lineup_favorites (user_id, lineup_item_id) values ($1, $2)`, [
      w.users.guest1,
      item?.id,
    ]);
    await db.expectError(
      w.users.guest1,
      `insert into public.lineup_favorites (user_id, lineup_item_id) values ($1, $2)`,
      [w.users.guest2, item?.id],
      { code: '42501' },
    );
    await db.expectError(
      w.users.guest1,
      `insert into public.push_tokens (token, user_id, platform) values ('x', $1, 'ios')`,
      [w.users.guest2],
      { code: '42501' },
    );
    expect(await db.as(w.users.guest2, `select * from public.lineup_favorites`)).toHaveLength(0);
  });

  it('sees only sent notifications addressed to a ticket type they hold', async () => {
    const db = getDb();
    const insert = `insert into public.notifications (event_id, title, body, audience_ticket_type_ids, sent_at)
                    values ($1, $2, 'b', $3, $4) returning id`;
    const [all] = await db.sql(insert, [w.events.a, 'All', null, new Date()]);
    const [vip] = await db.sql(insert, [w.events.a, 'VIP', [w.ticketTypes.aVip], new Date()]);
    const [draft] = await db.sql(insert, [w.events.a, 'Draft', null, null]);
    await db.sql(insert, [w.events.b, 'Other event', null, new Date()]);

    const g1 = await db.as(w.users.guest1, `select id from public.notifications where event_id = $1`, [w.events.a]);
    expect(ids(g1 as { id: string }[])).toEqual([all?.id, vip?.id].sort());
    const g2 = await db.as(w.users.guest2, `select id from public.notifications`);
    expect(ids(g2 as { id: string }[])).toEqual([all?.id]);
    expect(g1.map((r) => r.id)).not.toContain(draft?.id);
    expect(await db.as(w.users.outsider, `select id from public.notifications`)).toHaveLength(0);
  });

  it('records sponsor views only as themselves', async () => {
    const db = getDb();
    const [sa] = await db.sql(
      `insert into public.sponsor_activations (event_id, sponsor_name) values ($1, 'Acme') returning id`,
      [w.events.a],
    );
    await db.as(w.users.guest1, `insert into public.sponsor_views (sponsor_activation_id, user_id) values ($1, $2)`, [
      sa?.id,
      w.users.guest1,
    ]);
    await db.expectError(
      w.users.guest1,
      `insert into public.sponsor_views (sponsor_activation_id, user_id) values ($1, $2)`,
      [sa?.id, w.users.guest2],
      { code: '42501' },
    );
  });
});

describe('anon role', () => {
  it('sees nothing', async () => {
    const db = getDb();
    for (const table of ['events', 'guests', 'tickets', 'perks', 'profiles', 'lineup_items']) {
      expect(await db.as(null, `select * from public.${table}`), table).toHaveLength(0);
    }
  });
});

describe('staff role', () => {
  it('sees guests and tickets for assigned events only', async () => {
    const db = getDb();
    const guests = await db.as(w.users.staffA, `select distinct event_id from public.guests`);
    expect(guests.map((r) => r.event_id)).toEqual([w.events.a]);
    const tickets = await db.as(w.users.staffB, `select distinct event_id from public.tickets`);
    expect(tickets.map((r) => r.event_id)).toEqual([w.events.b]);
  });

  it('sees an assigned draft event, but not unassigned drafts', async () => {
    const db = getDb();
    expect(await db.as(w.users.staffA, `select id from public.events where id = $1`, [w.events.draft])).toHaveLength(0);
    await db.sql(`insert into public.staff_assignments (user_id, event_id, role) values ($1, $2, 'staff')`, [
      w.users.staffA,
      w.events.draft,
    ]);
    expect(await db.as(w.users.staffA, `select id from public.events where id = $1`, [w.events.draft])).toHaveLength(1);
  });

  it('checks in tickets only for assigned events', async () => {
    const db = getDb();
    const [r] = await db.as(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1) as r`, [
      w.tickets.g2aGa,
    ]);
    expect(r?.r.is_new).toBe(true);
    await db.expectError(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1)`, [w.tickets.g1bGa], {
      message: /not_event_staff/,
    });
  });

  it('cannot undo check-ins, adjust perks, or record manual-source ops', async () => {
    const db = getDb();
    const [r] = await db.as(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1) as r`, [
      w.tickets.g2aGa,
    ]);
    await db.expectError(w.users.staffA, `select public.undo_check_in($1, 'oops')`, [r?.r.check_in_id], {
      message: /not_event_manager/,
    });
    await db.expectError(
      w.users.staffA,
      `select public.adjust_perk(gen_random_uuid(), $1, $2, -1, 'comp')`,
      [w.tickets.g2aGa, w.perks.aDrink],
      { message: /not_event_manager/ },
    );
    await db.expectError(
      w.users.staffA,
      `select public.record_check_in(gen_random_uuid(), $1, now(), null, 'manual')`,
      [w.tickets.g2aGa],
      { message: /not_event_manager/ },
    );
  });

  it('cannot edit event config or read the audit log', async () => {
    const db = getDb();
    await db.expectError(w.users.staffA, `insert into public.perks (event_id, name) values ($1, 'x')`, [w.events.a], {
      code: '42501',
    });
    expect(await db.as(w.users.staffA, `update public.events set name = 'x' returning id`)).toHaveLength(0);
    expect(await db.as(w.users.staffA, `select * from public.audit_log`)).toHaveLength(0);
  });

  it('can see teammates but not staff on other events', async () => {
    const db = getDb();
    const rows = await db.as(w.users.staffA, `select id from public.profiles`);
    const seen = rows.map((r) => r.id);
    expect(seen).toContain(w.users.managerA);
    expect(seen).not.toContain(w.users.staffB);
  });
});

describe('manager role', () => {
  it('edits assigned events only and cannot create or delete events', async () => {
    const db = getDb();
    expect(await db.as(w.users.managerA, `update public.events set name = 'New' returning id`)).toEqual([
      { id: w.events.a },
    ]);
    await db.expectError(
      w.users.managerA,
      `insert into public.events (slug, name, starts_at, ends_at) values ('x', 'x', now(), now() + interval '1h')`,
      [],
      { code: '42501' },
    );
    expect(await db.as(w.users.managerA, `delete from public.events returning id`)).toHaveLength(0);
  });

  it('configures perks for assigned events and cannot cross events', async () => {
    const db = getDb();
    const [p] = await db.as(w.users.managerA, `insert into public.perks (event_id, name) values ($1, 'Poster') returning id`, [
      w.events.a,
    ]);
    await db.as(
      w.users.managerA,
      `insert into public.ticket_type_perks (ticket_type_id, perk_id, event_id, quantity) values ($1, $2, $3, 1)`,
      [w.ticketTypes.aGa, p?.id, w.events.a],
    );
    // B's ticket type cannot be mapped to A's perk: composite FK rejects it.
    await db.expectError(
      w.users.managerA,
      `insert into public.ticket_type_perks (ticket_type_id, perk_id, event_id, quantity) values ($1, $2, $3, 1)`,
      [w.ticketTypes.bGa, p?.id, w.events.a],
      { code: '23503' },
    );
    await db.expectError(
      w.users.managerA,
      `insert into public.perks (event_id, name) values ($1, 'Poster')`,
      [w.events.b],
      { code: '42501' },
    );
  });

  it('cannot change staff assignments or ticket data', async () => {
    const db = getDb();
    await db.expectError(
      w.users.managerA,
      `insert into public.staff_assignments (user_id, event_id, role) values ($1, $2, 'staff')`,
      [w.users.outsider, w.events.a],
      { code: '42501' },
    );
    await db.expectError(w.users.managerA, `delete from public.tickets`, [], { code: '42501' });
    await db.expectError(
      w.users.managerA,
      `insert into public.ticket_types (event_id, luma_ticket_type_id, name) values ($1, 'x', 'x')`,
      [w.events.a],
      { code: '42501' },
    );
  });

  it('reads the audit log for assigned events only', async () => {
    const db = getDb();
    await db.as(w.users.managerA, `update public.events set name = 'Renamed' where id = $1`, [w.events.a]);
    await db.as(w.users.staffB, `select public.record_check_in(gen_random_uuid(), $1)`, [w.tickets.g1bGa]);
    const rows = await db.as(w.users.managerA, `select distinct event_id from public.audit_log`);
    expect(rows.map((r) => r.event_id)).toEqual([w.events.a]);
    const [entry] = await db.as(
      w.users.managerA,
      `select actor_id, action from public.audit_log where entity = 'events' and action = 'update'`,
    );
    expect(entry).toEqual({ actor_id: w.users.managerA, action: 'update' });
  });

  it('sees sync runs for assigned events only', async () => {
    const db = getDb();
    await db.sql(`insert into public.luma_sync_runs (event_id, trigger) values ($1, 'manual'), ($2, 'manual')`, [
      w.events.a,
      w.events.b,
    ]);
    const rows = await db.as(w.users.managerA, `select event_id from public.luma_sync_runs`);
    expect(rows.map((r) => r.event_id)).toEqual([w.events.a]);
    expect(await db.as(w.users.staffA, `select * from public.luma_sync_runs`)).toHaveLength(0);
  });
});

describe('admin role', () => {
  it('sees and manages everything', async () => {
    const db = getDb();
    const events = await db.as(w.users.admin, `select id from public.events where id = any($1)`, [Object.values(w.events)]);
    expect(events).toHaveLength(3);
    await db.as(w.users.admin, `insert into public.staff_assignments (user_id, event_id, role) values ($1, $2, 'staff')`, [
      w.users.outsider,
      w.events.b,
    ]);
    await db.as(w.users.admin, `update public.profiles set is_admin = true where id = $1`, [w.users.managerA]);
    const [p] = await db.sql(`select is_admin from public.profiles where id = $1`, [w.users.managerA]);
    expect(p?.is_admin).toBe(true);
  });

  it('cannot read webhook receipts (service role only)', async () => {
    const db = getDb();
    await db.expectError(w.users.admin, `select * from public.luma_webhook_receipts`, [], { code: '42501' });
  });
});
