import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '../helpers/db.ts';
import { buildWorld, createUser, type World } from '../helpers/fixtures.ts';

const getDb = useTestDb();
let w: World;

beforeEach(async () => {
  w = await buildWorld(getDb());
});

interface TicketIn {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
}
function guest(n: string, tickets: TicketIn[], extra: Record<string, unknown> = {}) {
  return {
    id: `gst-${n}`,
    eventId: 'evt-x',
    guestKey: `g-${n}`,
    name: `Guest ${n}`,
    email: `guest-${n}@example.com`,
    approvalStatus: 'approved',
    tickets,
    ...extra,
  };
}
const tt = (id: string, name = 'GA') => ({ id: `evtticket-${id}`, ticketTypeId: 'tt-ga', ticketTypeName: name });

async function upsert(eventId: string, guests: unknown[]) {
  const [r] = await getDb().asService(`select public.luma_upsert_guests($1, $2::jsonb) as r`, [eventId, JSON.stringify(guests)]);
  return r?.r as { guests: number; tickets: number };
}

async function ticketsOf(lumaGuestId: string) {
  return getDb().sql(
    `select t.luma_ticket_id, t.status, tt.name as type_name, tt.luma_ticket_type_id
     from public.tickets t join public.guests g on g.id = t.guest_id
     join public.ticket_types tt on tt.id = t.ticket_type_id
     where g.luma_guest_id = $1 order by t.luma_ticket_id`,
    [lumaGuestId],
  );
}

describe('luma_upsert_ticket_types', () => {
  it('inserts new types and refreshes names without touching manager settings', async () => {
    const db = getDb();
    const types = [
      { id: 'tt-ga', name: 'GA', isHidden: false },
      { id: 'tt-vip', name: 'VIP', isHidden: true },
    ];
    await db.asService(`select public.luma_upsert_ticket_types($1, $2::jsonb)`, [w.events.a, JSON.stringify(types)]);
    await db.sql(`update public.ticket_types set is_hidden = true, sort_order = 9 where luma_ticket_type_id = 'tt-ga'`);
    types[0]!.name = 'General Admission';
    await db.asService(`select public.luma_upsert_ticket_types($1, $2::jsonb)`, [w.events.a, JSON.stringify(types)]);

    const rows = await db.sql(
      `select luma_ticket_type_id, name, is_hidden, sort_order from public.ticket_types
       where event_id = $1 and luma_ticket_type_id like 'tt-%' order by luma_ticket_type_id`,
      [w.events.a],
    );
    expect(rows).toEqual([
      { luma_ticket_type_id: 'tt-ga', name: 'General Admission', is_hidden: true, sort_order: 9 },
      { luma_ticket_type_id: 'tt-vip', name: 'VIP', is_hidden: true, sort_order: 1 },
    ]);
  });
});

describe('luma_upsert_guests', () => {
  it('creates guests and tickets, creating unknown ticket types from the ticket name', async () => {
    expect(await upsert(w.events.a, [guest('1', [tt('1a'), tt('1b')])])).toEqual({ guests: 1, tickets: 2 });
    expect(await ticketsOf('gst-1')).toEqual([
      { luma_ticket_id: 'evtticket-1a', status: 'active', type_name: 'GA', luma_ticket_type_id: 'tt-ga' },
      { luma_ticket_id: 'evtticket-1b', status: 'active', type_name: 'GA', luma_ticket_type_id: 'tt-ga' },
    ]);
  });

  it('is idempotent and does not rewrite unchanged rows', async () => {
    const db = getDb();
    await upsert(w.events.a, [guest('2', [tt('2a')])]);
    const [before] = await db.sql(`select updated_at from public.guests where luma_guest_id = 'gst-2'`);
    await db.sql(`select pg_sleep(0.01)`);
    await upsert(w.events.a, [guest('2', [tt('2a')])]);
    const [after] = await db.sql(`select updated_at from public.guests where luma_guest_id = 'gst-2'`);
    expect(after?.updated_at).toEqual(before?.updated_at);
    const [{ n }] = (await db.sql(`select count(*)::int as n from public.tickets where luma_ticket_id = 'evtticket-2a'`)) as [{ n: number }];
    expect(n).toBe(1);
  });

  it('updates status and email, and invalidates tickets Luma no longer lists', async () => {
    await upsert(w.events.a, [guest('3', [tt('3a'), tt('3b')])]);
    await upsert(w.events.a, [guest('3', [tt('3a')], { approvalStatus: 'declined', email: 'NEW-3@Example.com' })]);
    const [g] = await getDb().sql(`select approval_status, email from public.guests where luma_guest_id = 'gst-3'`);
    expect(g).toEqual({ approval_status: 'declined', email: 'new-3@example.com' });
    expect((await ticketsOf('gst-3')).map((t) => [t.luma_ticket_id, t.status])).toEqual([
      ['evtticket-3a', 'active'],
      ['evtticket-3b', 'invalidated'],
    ]);
    // Re-adding the ticket reactivates it.
    await upsert(w.events.a, [guest('3', [tt('3a'), tt('3b')])]);
    expect((await ticketsOf('gst-3')).every((t) => t.status === 'active')).toBe(true);
  });

  it('keeps check-in history when a ticket is invalidated, and blocks new check-ins', async () => {
    const db = getDb();
    await upsert(w.events.a, [guest('4', [tt('4a')])]);
    const [t] = await db.sql(`select id from public.tickets where luma_ticket_id = 'evtticket-4a'`);
    await db.as(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1)`, [t?.id]);
    await upsert(w.events.a, [guest('4', [])]);
    const [ci] = await db.sql(`select count(*)::int as n from public.check_ins where ticket_id = $1`, [t?.id]);
    expect(ci?.n).toBe(1);
    await db.expectError(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1)`, [t?.id], {
      message: /ticket_not_valid/,
    });
  });

  it('links synced guests to an existing account with the same confirmed email', async () => {
    const db = getDb();
    const userId = await createUser(db, 'guest-5@example.com');
    await upsert(w.events.a, [guest('5', [tt('5a')])]);
    const rows = await db.as(userId, `select luma_ticket_id from public.tickets`);
    expect(rows).toEqual([{ luma_ticket_id: 'evtticket-5a' }]);
  });

  it('keeps the same Luma guest in two events separate', async () => {
    await upsert(w.events.a, [guest('6', [tt('6a')])]);
    await upsert(w.events.b, [{ ...guest('6', [{ id: 'evtticket-6b', ticketTypeId: 'tt-b', ticketTypeName: 'GA' }]), guestKey: 'g-6b' }]);
    const rows = await getDb().sql(`select event_id from public.guests where luma_guest_id = 'gst-6' order by event_id`);
    expect(rows.map((r) => r.event_id).sort()).toEqual([w.events.a, w.events.b].sort());
  });

  it('rejects unknown events and malformed payloads', async () => {
    const db = getDb();
    await db.expectError('service', `select public.luma_upsert_guests($1, '[]'::jsonb)`, [randomUUID()], {
      message: /event_not_found/,
    });
    await db.expectError('service', `select public.luma_upsert_guests($1, '[{"id":"gst-x"}]'::jsonb)`, [w.events.a], {
      message: /invalid_guest_payload/,
    });
  });

  it('is callable only by the service role', async () => {
    const db = getDb();
    for (const user of [w.users.admin, w.users.managerA, w.users.guest1]) {
      await db.expectError(user, `select public.luma_upsert_guests($1, '[]'::jsonb)`, [w.events.a], { code: '42501' });
      await db.expectError(user, `select public.luma_upsert_ticket_types($1, '[]'::jsonb)`, [w.events.a], {
        code: '42501',
      });
      await db.expectError(user, `select public.luma_record_key_alias($1, 'k', 'gst-1')`, [w.events.a], {
        code: '42501',
      });
    }
  });
});

describe('resolve_check_in_key', () => {
  beforeEach(async () => {
    await upsert(w.events.a, [guest('7', [tt('7a'), tt('7b')])]);
  });

  async function resolve(key: string, user = w.users.staffA, event = w.events.a) {
    return getDb().as(
      user,
      `select t.luma_ticket_id, r.matched_by from public.resolve_check_in_key($1, $2) r
       join public.tickets t on t.id = r.ticket_id order by t.luma_ticket_id`,
      [event, key],
    );
  }

  it('resolves a guest key to every ticket on the registration', async () => {
    expect(await resolve('g-7')).toEqual([
      { luma_ticket_id: 'evtticket-7a', matched_by: 'guest_key' },
      { luma_ticket_id: 'evtticket-7b', matched_by: 'guest_key' },
    ]);
  });

  it('returns nothing for unknown keys, then resolves them once aliased', async () => {
    const db = getDb();
    expect(await resolve('TKEY7B')).toEqual([]);
    await db.asService(`select public.luma_record_key_alias($1, 'TKEY7B', 'gst-7', 'evtticket-7b')`, [w.events.a]);
    expect(await resolve('TKEY7B')).toEqual([{ luma_ticket_id: 'evtticket-7b', matched_by: 'ticket_key' }]);

    // Ambiguous alias (exact ticket unknown) resolves to the whole guest.
    await db.asService(`select public.luma_record_key_alias($1, 'TKEY7X', 'gst-7')`, [w.events.a]);
    expect((await resolve('TKEY7X')).map((r) => r.matched_by)).toEqual(['alias', 'alias']);
  });

  it('does not resolve keys from another event', async () => {
    // staffB works event B: event A's guest key means nothing there...
    expect(await resolve('g-7', w.users.staffB, w.events.b)).toEqual([]);
    // ...and they cannot query event A at all.
    await getDb().expectError(w.users.staffB, `select * from public.resolve_check_in_key($1, 'g-7')`, [w.events.a], {
      message: /not_event_staff/,
    });
  });

  it('is staff-only', async () => {
    await getDb().expectError(w.users.guest1, `select * from public.resolve_check_in_key($1, 'g-7')`, [w.events.a], {
      message: /not_event_staff/,
    });
  });
});

describe('my_event_role', () => {
  it('reports the caller role per event', async () => {
    const db = getDb();
    const role = async (user: string, event: string) =>
      (await db.as(user, `select public.my_event_role($1) as r`, [event]))[0]?.r;
    expect(await role(w.users.admin, w.events.b)).toBe('admin');
    expect(await role(w.users.managerA, w.events.a)).toBe('manager');
    expect(await role(w.users.staffA, w.events.a)).toBe('staff');
    expect(await role(w.users.staffA, w.events.b)).toBeNull();
    expect(await role(w.users.guest1, w.events.b)).toBe('guest');
    expect(await role(w.users.outsider, w.events.a)).toBeNull();
  });
});
