import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '../helpers/db.ts';
import { buildWorld, createUser, mapPerk, type World } from '../helpers/fixtures.ts';

const getDb = useTestDb();
let w: World;

beforeEach(async () => {
  w = await buildWorld(getDb());
});

describe('admits_entry', () => {
  it('blocks check-in on add-on tickets but still allows their perks', async () => {
    const db = getDb();
    await db.as(w.users.managerA, `update public.ticket_types set admits_entry = false where id = $1`, [w.ticketTypes.aVip]);
    await db.expectError(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1)`, [w.tickets.g1aVip], {
      message: /ticket_not_entry/,
    });
    const [r] = await db.as(w.users.staffA, `select public.record_perk_redemption(gen_random_uuid(), $1, $2) as r`, [
      w.tickets.g1aVip,
      w.perks.aDrink,
    ]);
    expect(r?.r.remaining).toBe(1);
  });

  it('defaults to admitting entry and is audited when a manager changes it', async () => {
    const db = getDb();
    const [t] = await db.sql(`select admits_entry from public.ticket_types where id = $1`, [w.ticketTypes.aGa]);
    expect(t?.admits_entry).toBe(true);
    await db.as(w.users.managerA, `update public.ticket_types set admits_entry = false where id = $1`, [w.ticketTypes.aGa]);
    const [a] = await db.sql(
      `select actor_id, entity from public.audit_log where entity = 'ticket_types' and entity_id = $1`,
      [w.ticketTypes.aGa],
    );
    expect(a).toEqual({ actor_id: w.users.managerA, entity: 'ticket_types' });
  });

  it('staff cannot change it', async () => {
    const rows = await getDb().as(
      w.users.staffA,
      `update public.ticket_types set admits_entry = false where id = $1 returning id`,
      [w.ticketTypes.aGa],
    );
    expect(rows).toHaveLength(0);
  });

  it('is unaffected by Luma syncs', async () => {
    const db = getDb();
    await db.sql(`update public.ticket_types set admits_entry = false where id = $1`, [w.ticketTypes.aGa]);
    const [tt] = await db.sql(`select luma_ticket_type_id from public.ticket_types where id = $1`, [w.ticketTypes.aGa]);
    await db.asService(`select public.luma_upsert_ticket_types($1, $2::jsonb)`, [
      w.events.a,
      JSON.stringify([{ id: tt?.luma_ticket_type_id, name: 'GA renamed', isHidden: false }]),
    ]);
    const [after] = await db.sql(`select admits_entry, name from public.ticket_types where id = $1`, [w.ticketTypes.aGa]);
    expect(after).toEqual({ admits_entry: false, name: 'GA renamed' });
  });
});

describe('staff invites', () => {
  it('turns into an assignment when the invitee signs up and confirms', async () => {
    const db = getDb();
    await db.as(w.users.admin, `insert into public.staff_invites (email, event_id, role) values ('new-staff@example.com', $1, 'staff')`, [
      w.events.a,
    ]);
    const userId = await createUser(db, 'New-Staff@Example.com');
    const rows = await db.sql(`select event_id, role from public.staff_assignments where user_id = $1`, [userId]);
    expect(rows).toEqual([{ event_id: w.events.a, role: 'staff' }]);
    const [inv] = await db.sql(`select accepted_at from public.staff_invites where email = 'new-staff@example.com'`);
    expect(inv?.accepted_at).not.toBeNull();
  });

  it('applies immediately for an existing account, and can grant admin', async () => {
    const db = getDb();
    await db.as(w.users.admin, `insert into public.staff_invites (email, event_id, role) values (
      (select email from public.profiles where id = $1), $2, 'manager')`, [w.users.outsider, w.events.b]);
    await db.as(w.users.admin, `insert into public.staff_invites (email, make_admin) values (
      (select email from public.profiles where id = $1), true)`, [w.users.outsider]);
    expect(await db.as(w.users.outsider, `select public.my_event_role($1) as r`, [w.events.b])).toEqual([{ r: 'admin' }]);
    const [p] = await db.sql(`select is_admin from public.profiles where id = $1`, [w.users.outsider]);
    expect(p?.is_admin).toBe(true);
  });

  it('waits for email confirmation before granting anything', async () => {
    const db = getDb();
    await db.as(w.users.admin, `insert into public.staff_invites (email, make_admin) values ('pending@example.com', true)`);
    const userId = await createUser(db, 'pending@example.com', { confirmed: false });
    const [p] = await db.sql(`select is_admin from public.profiles where id = $1`, [userId]);
    expect(p?.is_admin).toBe(false);
    await db.sql(`update auth.users set email_confirmed_at = now() where id = $1`, [userId]);
    const [p2] = await db.sql(`select is_admin from public.profiles where id = $1`, [userId]);
    expect(p2?.is_admin).toBe(true);
  });

  it('only admins can see or create invites', async () => {
    const db = getDb();
    await db.expectError(
      w.users.managerA,
      `insert into public.staff_invites (email, event_id, role) values ('x@example.com', $1, 'staff')`,
      [w.events.a],
      { code: '42501' },
    );
    await db.as(w.users.admin, `insert into public.staff_invites (email, make_admin) values ('y@example.com', true)`);
    expect(await db.as(w.users.managerA, `select * from public.staff_invites`)).toHaveLength(0);
    expect(await db.as(w.users.admin, `select * from public.staff_invites`)).toHaveLength(1);
  });

  it('rejects malformed invites', async () => {
    const db = getDb();
    await db.expectError(w.users.admin, `insert into public.staff_invites (email, make_admin) values ('Upper@Example.com', true)`, [], {
      code: '23514',
    });
    await db.expectError(
      w.users.admin,
      `insert into public.staff_invites (email, event_id, role, make_admin) values ('z@example.com', $1, 'staff', true)`,
      [w.events.a],
      { code: '23514' },
    );
  });

  it('audits admin grants', async () => {
    const db = getDb();
    await db.as(w.users.admin, `update public.profiles set is_admin = true where id = $1`, [w.users.managerA]);
    const rows = await db.sql(`select actor_id from public.audit_log where entity = 'profiles' and entity_id = $1`, [
      w.users.managerA,
    ]);
    expect(rows).toEqual([{ actor_id: w.users.admin }]);
  });
});

describe('perk mapping on add-on ticket types', () => {
  it('lets managers map perks to add-on types', async () => {
    const db = getDb();
    const [addon] = await db.sql(
      `insert into public.ticket_types (event_id, luma_ticket_type_id, name, admits_entry)
       values ($1, 'tt-addon', 'After Party Upgrade', false) returning id`,
      [w.events.a],
    );
    await mapPerk(db, w.events.a, addon!.id as string, w.perks.aDrink, 1);
    const rows = await db.as(w.users.managerA, `select quantity from public.ticket_type_perks where ticket_type_id = $1`, [addon!.id]);
    expect(rows).toEqual([{ quantity: 1 }]);
  });
});
