import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '../helpers/db.ts';
import { buildWorld, type World } from '../helpers/fixtures.ts';

const getDb = useTestDb();
let w: World;

beforeEach(async () => {
  w = await buildWorld(getDb());
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

async function checkIn(userId: string, ticketId: string, opts: { op?: string; at?: string; source?: string } = {}) {
  const [row] = await getDb().as(
    userId,
    `select public.record_check_in($1, $2, $3, 'device-1', $4::public.op_source) as r`,
    [opts.op ?? randomUUID(), ticketId, opts.at ?? new Date().toISOString(), opts.source ?? 'online'],
  );
  return row?.r as Record<string, any>;
}

async function redeem(
  userId: string,
  ticketId: string,
  perkId: string,
  opts: { op?: string; at?: string; source?: string; qty?: number } = {},
) {
  const [row] = await getDb().as(
    userId,
    `select public.record_perk_redemption($1, $2, $3, $4, $5, 'device-1', $6::public.op_source) as r`,
    [opts.op ?? randomUUID(), ticketId, perkId, opts.qty ?? 1, opts.at ?? new Date().toISOString(), opts.source ?? 'online'],
  );
  return row?.r as Record<string, any>;
}

async function status(ticketId: string) {
  const [row] = await getDb().sql(`select * from public.ticket_check_in_status where ticket_id = $1`, [ticketId]);
  return row!;
}

describe('check-ins', () => {
  it('is idempotent per op_id', async () => {
    const op = randomUUID();
    const first = await checkIn(w.users.staffA, w.tickets.g2aGa, { op });
    const replay = await checkIn(w.users.staffA, w.tickets.g2aGa, { op });
    expect(first.is_new).toBe(true);
    expect(replay.is_new).toBe(false);
    expect(replay.check_in_id).toBe(first.check_in_id);
    const rows = await getDb().sql(`select count(*)::int as n from public.check_ins where op_id = $1`, [op]);
    expect(rows[0]?.n).toBe(1);
  });

  it('rejects an op_id reused for a different ticket', async () => {
    const op = randomUUID();
    await checkIn(w.users.managerA, w.tickets.g2aGa, { op });
    await getDb().expectError(
      w.users.managerA,
      `select public.record_check_in($1, $2)`,
      [op, w.tickets.g1aVip],
      { message: /op_id_reused/ },
    );
  });

  it('reports a second scan as already checked in, with who and when', async () => {
    const first = await checkIn(w.users.staffA, w.tickets.g2aGa, { at: minutesAgo(2) });
    const second = await checkIn(w.users.managerA, w.tickets.g2aGa, { at: minutesAgo(1) });
    expect(first.is_effective).toBe(true);
    expect(second.is_new).toBe(true);
    expect(second.is_effective).toBe(false);
    expect(second.checked_in_by).toBe(w.users.staffA);
    expect(second.checked_in_by_name).toBe('Sam Staff');
    expect((await status(w.tickets.g2aGa)).scan_count).toBe(2);
  });

  it('resolves offline conflicts by earliest scan time, regardless of sync order', async () => {
    // Device B synced first, but device A scanned earlier while offline.
    const later = await checkIn(w.users.staffA, w.tickets.g2aGa, { at: minutesAgo(5), source: 'offline' });
    const earlier = await checkIn(w.users.managerA, w.tickets.g2aGa, { at: minutesAgo(10), source: 'offline' });
    expect(later.is_effective).toBe(true); // at the time it synced
    expect(earlier.is_effective).toBe(true);
    const s = await status(w.tickets.g2aGa);
    expect(s.check_in_id).toBe(earlier.check_in_id);
    expect(s.checked_in_by).toBe(w.users.managerA);
  });

  it('breaks exact-timestamp ties by op_id', async () => {
    const at = minutesAgo(3);
    const [opLow, opHigh] = [randomUUID(), randomUUID()].sort();
    await checkIn(w.users.staffA, w.tickets.g2aGa, { op: opHigh!, at });
    await checkIn(w.users.staffA, w.tickets.g2aGa, { op: opLow!, at });
    const [eff] = await getDb().sql(
      `select c.op_id from public.ticket_check_in_status s join public.check_ins c on c.id = s.check_in_id
       where s.ticket_id = $1`,
      [w.tickets.g2aGa],
    );
    expect(eff?.op_id).toBe(opLow);
  });

  it('clamps device clocks that run ahead of the server', async () => {
    const r = await checkIn(w.users.staffA, w.tickets.g2aGa, {
      at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(new Date(r.checked_in_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('rejects cancelled tickets and declined guests', async () => {
    const db = getDb();
    for (const ticket of [w.tickets.cancelledA, w.tickets.declinedA]) {
      await db.expectError(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1)`, [ticket], {
        message: /ticket_not_valid/,
      });
    }
    await db.expectError(w.users.staffA, `select public.record_check_in(gen_random_uuid(), $1)`, [randomUUID()], {
      message: /ticket_not_found/,
    });
  });

  it('undo requires a reason, moves the effective check-in, and is audited', async () => {
    const db = getDb();
    const first = await checkIn(w.users.staffA, w.tickets.g2aGa, { at: minutesAgo(10) });
    const second = await checkIn(w.users.staffA, w.tickets.g2aGa, { at: minutesAgo(5) });
    await db.expectError(w.users.managerA, `select public.undo_check_in($1, '  ')`, [first.check_in_id], {
      message: /reason_required/,
    });
    await db.as(w.users.managerA, `select public.undo_check_in($1, 'scanned wrong wristband')`, [first.check_in_id]);
    expect((await status(w.tickets.g2aGa)).check_in_id).toBe(second.check_in_id);

    const [audit] = await db.sql(
      `select actor_id, reason from public.audit_log where action = 'undo_check_in' and entity_id = $1`,
      [first.check_in_id],
    );
    expect(audit).toEqual({ actor_id: w.users.managerA, reason: 'scanned wrong wristband' });
  });

  it('writes an audit entry per new check-in, none per replay', async () => {
    const db = getDb();
    const op = randomUUID();
    await checkIn(w.users.staffA, w.tickets.g2aGa, { op });
    await checkIn(w.users.staffA, w.tickets.g2aGa, { op });
    const rows = await db.sql(`select * from public.audit_log where action = 'check_in' and after ->> 'op_id' = $1`, [op]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.device_id).toBe('device-1');
  });
});

describe('perk redemptions', () => {
  it('decrements the balance and rejects online redemption past the allowance', async () => {
    const db = getDb();
    expect((await redeem(w.users.staffA, w.tickets.g1aVip, w.perks.aDrink)).remaining).toBe(1);
    expect((await redeem(w.users.staffA, w.tickets.g1aVip, w.perks.aDrink)).remaining).toBe(0);
    await db.expectError(
      w.users.staffA,
      `select public.record_perk_redemption(gen_random_uuid(), $1, $2)`,
      [w.tickets.g1aVip, w.perks.aDrink],
      { message: /perk_exhausted/ },
    );
  });

  it('never double-counts a replayed op, even after the balance is used up', async () => {
    const op = randomUUID();
    await redeem(w.users.staffA, w.tickets.g2aGa, w.perks.aDrink, { op });
    const replay = await redeem(w.users.staffA, w.tickets.g2aGa, w.perks.aDrink, { op });
    expect(replay.is_new).toBe(false);
    expect(replay.remaining).toBe(0);
  });

  it('accepts offline redemptions past the allowance and flags them over_limit deterministically', async () => {
    const db = getDb();
    // Two devices each handed out the GA guest's single drink token offline.
    // The later scan syncs first; the earlier scan is still the legitimate one.
    const later = await redeem(w.users.staffA, w.tickets.g2aGa, w.perks.aDrink, {
      at: minutesAgo(2),
      source: 'offline',
    });
    const earlier = await redeem(w.users.managerA, w.tickets.g2aGa, w.perks.aDrink, {
      at: minutesAgo(8),
      source: 'offline',
    });
    expect(earlier.remaining).toBe(-1);

    const ledger = await db.as(
      w.users.managerA,
      `select id, over_limit, balance_after from public.perk_redemption_ledger
       where ticket_id = $1 order by scanned_at`,
      [w.tickets.g2aGa],
    );
    expect(ledger).toEqual([
      { id: earlier.redemption_id, over_limit: false, balance_after: 0 },
      { id: later.redemption_id, over_limit: true, balance_after: -1 },
    ]);
  });

  it('rejects perks not included in the ticket type', async () => {
    await getDb().expectError(
      w.users.staffA,
      `select public.record_perk_redemption(gen_random_uuid(), $1, $2)`,
      [w.tickets.g2aGa, w.perks.aLounge],
      { message: /perk_not_included/ },
    );
  });

  it('rejects perks from another event', async () => {
    await getDb().expectError(
      w.users.staffA,
      `select public.record_perk_redemption(gen_random_uuid(), $1, $2)`,
      [w.tickets.g1aVip, w.perks.bDrink],
      { message: /perk_not_found/ },
    );
  });

  it('enforces the perk time window', async () => {
    const db = getDb();
    await db.expectError(
      w.users.staffA,
      `select public.record_perk_redemption(gen_random_uuid(), $1, $2)`,
      [w.tickets.g1aVip, w.perks.aTimed],
      { message: /perk_outside_window/ },
    );
    // Scanned inside the window while offline, synced after it closed: accepted.
    const r = await redeem(w.users.staffA, w.tickets.g1aVip, w.perks.aTimed, {
      at: minutesAgo(30),
      source: 'offline',
    });
    expect(r.remaining).toBe(0);
  });

  it('lets managers adjust balances with a required reason', async () => {
    const db = getDb();
    await redeem(w.users.staffA, w.tickets.g2aGa, w.perks.aDrink);
    await db.expectError(
      w.users.managerA,
      `select public.adjust_perk(gen_random_uuid(), $1, $2, -1, '')`,
      [w.tickets.g2aGa, w.perks.aDrink],
      { message: /reason_required/ },
    );
    const [r] = await db.as(
      w.users.managerA,
      `select public.adjust_perk(gen_random_uuid(), $1, $2, -1, 'spilled drink') as r`,
      [w.tickets.g2aGa, w.perks.aDrink],
    );
    expect(r?.r.remaining).toBe(1);
    const [audit] = await db.sql(`select reason from public.audit_log where action = 'perk_adjust'`);
    expect(audit?.reason).toBe('spilled drink');
  });

  it('shows the guest their own remaining balance', async () => {
    await redeem(w.users.staffA, w.tickets.g1aVip, w.perks.aDrink);
    const rows = await getDb().as(
      w.users.guest1,
      `select allowance, used, remaining from public.ticket_perk_balances where ticket_id = $1 and perk_id = $2`,
      [w.tickets.g1aVip, w.perks.aDrink],
    );
    expect(rows).toEqual([{ allowance: 2, used: 1, remaining: 1 }]);
  });
});
