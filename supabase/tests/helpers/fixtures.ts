import { randomUUID } from 'node:crypto';
import type { TestDb } from './db.ts';

export interface World {
  users: {
    admin: string;
    managerA: string;
    staffA: string;
    staffB: string;
    /** Holds a VIP ticket at A and a GA ticket at B under the same email. */
    guest1: string;
    /** Holds a GA ticket at A. */
    guest2: string;
    /** Signed in, no tickets anywhere. */
    outsider: string;
  };
  events: { a: string; b: string; draft: string };
  ticketTypes: { aGa: string; aVip: string; bGa: string };
  perks: { aDrink: string; aLounge: string; aTimed: string; bDrink: string };
  guests: { g1a: string; g1b: string; g2a: string; cancelledA: string; declinedA: string };
  tickets: {
    g1aVip: string;
    g1bGa: string;
    g2aGa: string;
    cancelledA: string;
    declinedA: string;
  };
}

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createUser(
  db: TestDb,
  email: string,
  opts: { confirmed?: boolean; admin?: boolean; name?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await db.sql(
    `insert into auth.users (id, aud, role, email, email_confirmed_at)
     values ($1, 'authenticated', 'authenticated', $2, $3)`,
    [id, email, opts.confirmed === false ? null : new Date().toISOString()],
  );
  if (opts.admin || opts.name) {
    await db.sql(`update public.profiles set is_admin = $2, display_name = $3 where id = $1`, [
      id,
      opts.admin ?? false,
      opts.name ?? null,
    ]);
  }
  return id;
}

async function insertOne(db: TestDb, sql: string, params: unknown[]): Promise<string> {
  const [row] = await db.sql<{ id: string }>(sql, params);
  if (!row) throw new Error(`insert returned nothing: ${sql}`);
  return row.id;
}

export async function createEvent(
  db: TestDb,
  status: 'draft' | 'published' | 'archived' = 'published',
): Promise<string> {
  const slug = `event-${uniq()}`;
  return insertOne(
    db,
    `insert into public.events (luma_event_id, slug, name, starts_at, ends_at, status)
     values ($1, $2, $3, now() - interval '1 hour', now() + interval '6 hours', $4) returning id`,
    [`evt-${slug}`, slug, `Event ${slug}`, status],
  );
}

export async function createTicketType(db: TestDb, eventId: string, name: string): Promise<string> {
  return insertOne(
    db,
    `insert into public.ticket_types (event_id, luma_ticket_type_id, name)
     values ($1, $2, $3) returning id`,
    [eventId, `evtticktyp-${uniq()}`, name],
  );
}

export async function createPerk(
  db: TestDb,
  eventId: string,
  name: string,
  window?: { from: string; until: string },
): Promise<string> {
  return insertOne(
    db,
    `insert into public.perks (event_id, name, valid_from, valid_until)
     values ($1, $2, $3, $4) returning id`,
    [eventId, name, window?.from ?? null, window?.until ?? null],
  );
}

export async function mapPerk(
  db: TestDb,
  eventId: string,
  ticketTypeId: string,
  perkId: string,
  quantity: number,
): Promise<void> {
  await db.sql(
    `insert into public.ticket_type_perks (ticket_type_id, perk_id, event_id, quantity)
     values ($1, $2, $3, $4)`,
    [ticketTypeId, perkId, eventId, quantity],
  );
}

export async function createGuest(
  db: TestDb,
  eventId: string,
  email: string,
  approvalStatus = 'approved',
): Promise<string> {
  const k = uniq();
  return insertOne(
    db,
    `insert into public.guests (event_id, luma_guest_id, guest_key, name, email, approval_status)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [eventId, `gst-${k}`, `g-${k}`, `Guest ${k}`, email, approvalStatus],
  );
}

export async function createTicket(
  db: TestDb,
  eventId: string,
  guestId: string,
  ticketTypeId: string,
  status = 'active',
): Promise<string> {
  return insertOne(
    db,
    `insert into public.tickets (event_id, guest_id, ticket_type_id, luma_ticket_id, status)
     values ($1, $2, $3, $4, $5) returning id`,
    [eventId, guestId, ticketTypeId, `eventticket-${uniq()}`, status],
  );
}

export async function assign(
  db: TestDb,
  userId: string,
  eventId: string,
  role: 'staff' | 'manager',
): Promise<void> {
  await db.sql(`insert into public.staff_assignments (user_id, event_id, role) values ($1, $2, $3)`, [
    userId,
    eventId,
    role,
  ]);
}

export async function buildWorld(db: TestDb): Promise<World> {
  const s = uniq();
  const events = {
    a: await createEvent(db),
    b: await createEvent(db),
    draft: await createEvent(db, 'draft'),
  };
  const ticketTypes = {
    aGa: await createTicketType(db, events.a, 'General Admission'),
    aVip: await createTicketType(db, events.a, 'VIP'),
    bGa: await createTicketType(db, events.b, 'General Admission'),
  };
  const perks = {
    aDrink: await createPerk(db, events.a, 'Drink Token'),
    aLounge: await createPerk(db, events.a, 'VIP Lounge Access'),
    aTimed: await createPerk(db, events.a, 'Early Merch Pickup', {
      from: new Date(Date.now() - 3_600_000).toISOString(),
      until: new Date(Date.now() - 60_000).toISOString(),
    }),
    bDrink: await createPerk(db, events.b, 'Drink Token'),
  };
  await mapPerk(db, events.a, ticketTypes.aVip, perks.aDrink, 2);
  await mapPerk(db, events.a, ticketTypes.aVip, perks.aLounge, 1);
  await mapPerk(db, events.a, ticketTypes.aVip, perks.aTimed, 1);
  await mapPerk(db, events.a, ticketTypes.aGa, perks.aDrink, 1);
  await mapPerk(db, events.b, ticketTypes.bGa, perks.bDrink, 1);

  // Guests synced before the users exist (link happens on user creation)...
  const guest1Email = `guest1-${s}@example.com`;
  const g1a = await createGuest(db, events.a, guest1Email);
  const g1b = await createGuest(db, events.b, guest1Email.toUpperCase());

  const users = {
    admin: await createUser(db, `admin-${s}@example.com`, { admin: true }),
    managerA: await createUser(db, `manager-${s}@example.com`, { name: 'Morgan Manager' }),
    staffA: await createUser(db, `staffa-${s}@example.com`, { name: 'Sam Staff' }),
    staffB: await createUser(db, `staffb-${s}@example.com`),
    guest1: await createUser(db, guest1Email),
    guest2: await createUser(db, `guest2-${s}@example.com`),
    outsider: await createUser(db, `outsider-${s}@example.com`),
  };

  // ...and guests synced after the user exists (link happens on guest insert).
  const g2a = await createGuest(db, events.a, `guest2-${s}@example.com`);
  const cancelledA = await createGuest(db, events.a, `cancelled-${s}@example.com`);
  const declinedA = await createGuest(db, events.a, `declined-${s}@example.com`, 'declined');

  const tickets = {
    g1aVip: await createTicket(db, events.a, g1a, ticketTypes.aVip),
    g1bGa: await createTicket(db, events.b, g1b, ticketTypes.bGa),
    g2aGa: await createTicket(db, events.a, g2a, ticketTypes.aGa),
    cancelledA: await createTicket(db, events.a, cancelledA, ticketTypes.aGa, 'invalidated'),
    declinedA: await createTicket(db, events.a, declinedA, ticketTypes.aGa),
  };

  await assign(db, users.managerA, events.a, 'manager');
  await assign(db, users.staffA, events.a, 'staff');
  await assign(db, users.staffB, events.b, 'staff');

  return {
    users,
    events,
    ticketTypes,
    perks,
    guests: { g1a, g1b, g2a, cancelledA, declinedA },
    tickets,
  };
}
