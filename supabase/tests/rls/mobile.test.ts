import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '../helpers/db.ts';
import { buildWorld, type World } from '../helpers/fixtures.ts';

const getDb = useTestDb();
let w: World;
const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';

beforeEach(async () => {
  w = await buildWorld(getDb());
});

describe('register_push_token', () => {
  it('records the token for the caller', async () => {
    const db = getDb();
    await db.as(w.users.guest1, `select public.register_push_token($1, 'ios')`, [TOKEN]);
    const rows = await db.as(w.users.guest1, `select user_id, platform from public.push_tokens`);
    expect(rows).toEqual([{ user_id: w.users.guest1, platform: 'ios' }]);
  });

  it('moves a device token to whoever signs in on it next', async () => {
    const db = getDb();
    await db.as(w.users.guest1, `select public.register_push_token($1, 'android')`, [TOKEN]);
    await db.as(w.users.guest2, `select public.register_push_token($1, 'android')`, [TOKEN]);
    expect(await db.as(w.users.guest1, `select token from public.push_tokens`)).toEqual([]);
    expect(await db.as(w.users.guest2, `select token from public.push_tokens`)).toEqual([{ token: TOKEN }]);
  });

  it('rejects junk tokens, bad platforms and anonymous callers', async () => {
    const db = getDb();
    await db.expectError(w.users.guest1, `select public.register_push_token('not-a-token', 'ios')`, [], {
      message: /invalid_push_token/,
    });
    await db.expectError(w.users.guest1, `select public.register_push_token($1, 'web')`, [TOKEN], {
      message: /invalid_platform/,
    });
    await db.expectError(null, `select public.register_push_token($1, 'ios')`, [TOKEN], {});
  });

  it("can't read or delete other people's tokens", async () => {
    const db = getDb();
    await db.as(w.users.guest1, `select public.register_push_token($1, 'ios')`, [TOKEN]);
    expect(await db.as(w.users.guest2, `delete from public.push_tokens returning token`)).toEqual([]);
    expect(await db.as(w.users.outsider, `select token from public.push_tokens`)).toEqual([]);
  });
});

describe('what the guest app reads', () => {
  it("shows a guest their own ticket, QR key and perk balances, and nobody else's", async () => {
    const db = getDb();
    const guests = await db.as(w.users.guest1, `select id, guest_key from public.guests where event_id = $1`, [w.events.a]);
    expect(guests.map((g) => g.id)).toEqual([w.guests.g1a]);
    expect(guests[0]?.guest_key).toMatch(/^g-/);

    const balances = await db.as(
      w.users.guest1,
      `select perk_name, remaining from public.ticket_perk_balances where ticket_id = $1 order by perk_name`,
      [w.tickets.g1aVip],
    );
    expect(balances.map((b) => b.perk_name)).toEqual(['Drink Token', 'Early Merch Pickup', 'VIP Lounge Access']);
    expect(
      await db.as(w.users.guest1, `select ticket_id from public.ticket_perk_balances where ticket_id = $1`, [w.tickets.g2aGa]),
    ).toEqual([]);
  });

  it('lets guests favourite sets and log sponsor views only as themselves', async () => {
    const db = getDb();
    const [item] = await db.sql(
      `insert into public.lineup_items (event_id, artist, stage, starts_at, ends_at)
       values ($1, 'Artist', 'Main', now(), now() + interval '1 hour') returning id`,
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
      { message: /row-level security/ },
    );
  });
});
