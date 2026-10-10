import { describe, expect, it } from 'vitest';
import {
  createLumaAdapter,
  generateMockDataset,
  LiveLumaAdapter,
  LumaGuestSchema,
  MockLumaAdapter,
} from '../src/index.ts';
import { DEMO_GUEST_EMAIL } from '../src/luma/mock/fixtures.ts';

describe('mock dataset', () => {
  it('is deterministic', () => {
    expect(generateMockDataset()).toEqual(generateMockDataset());
    expect(generateMockDataset(1)).not.toEqual(generateMockDataset(2));
  });

  it('produces valid, unique, Luma-shaped identifiers', () => {
    const { events } = generateMockDataset();
    const guests = events.flatMap((e) => e.guests);
    const tickets = guests.flatMap((g) => g.tickets);
    for (const g of guests) {
      expect(() => LumaGuestSchema.parse(g)).not.toThrow();
      expect(g.guestKey).toMatch(/^g-/);
      expect(g.id).toMatch(/^gst-/);
    }
    expect(new Set(guests.map((g) => g.guestKey)).size).toBe(guests.length);
    expect(new Set(tickets.map((t) => t.id)).size).toBe(tickets.length);
    for (const e of events) {
      const typeIds = new Set(e.ticketTypes.map((t) => t.id));
      for (const g of e.guests) for (const t of g.tickets) expect(typeIds.has(t.ticketTypeId)).toBe(true);
    }
  });

  it('includes people at several events under one email', () => {
    const { events } = generateMockDataset();
    const counts = new Map<string, number>();
    for (const e of events) for (const g of e.guests) counts.set(g.email, (counts.get(g.email) ?? 0) + 1);
    expect([...counts.values()].filter((n) => n > 1).length).toBeGreaterThan(5);
    expect(counts.get(DEMO_GUEST_EMAIL)).toBe(2);
  });

  it('includes non-approved guests and multi-ticket registrations', () => {
    const guests = generateMockDataset().events.flatMap((e) => e.guests);
    expect(guests.some((g) => g.approvalStatus !== 'approved')).toBe(true);
    expect(guests.some((g) => g.tickets.length > 1)).toBe(true);
  });

  it('keeps ticket keys off the guest payload, like the real API', () => {
    const { events } = generateMockDataset();
    const e = events[0]!;
    expect(Object.keys(e.ticketKeys).length).toBe(e.guests.flatMap((g) => g.tickets).length);
    expect(JSON.stringify(e.guests)).not.toContain(Object.keys(e.ticketKeys)[0]);
  });
});

describe('MockLumaAdapter', () => {
  const dataset = generateMockDataset();
  const adapter = new MockLumaAdapter(dataset);
  const first = dataset.events[0]!;

  it('pages through every guest exactly once', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await adapter.listGuests(first.event.id, { cursor, limit: 7 });
      expect(page.entries.length).toBeLessThanOrEqual(7);
      seen.push(...page.entries.map((g) => g.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(first.guests.map((g) => g.id));
  });

  it('looks up guests by id, guest key, ticket key, and email', async () => {
    const g = first.guests[3]!;
    const id = first.event.id;
    const ticketKey = Object.entries(first.ticketKeys).find(([, tid]) => tid === g.tickets[0]!.id)![0];
    expect(await adapter.getGuest(id, g.id)).toEqual(g);
    expect(await adapter.getGuest(id, g.guestKey)).toEqual(g);
    expect(await adapter.getGuest(id, ticketKey)).toEqual(g);
    expect(await adapter.getGuest(id, g.email.toUpperCase())).toEqual(g);
    expect(await adapter.getGuest(id, 'g-missing')).toBeNull();
  });

  it('returns empty results for unknown events', async () => {
    expect(await adapter.getEvent('evt-nope')).toBeNull();
    expect(await adapter.listTicketTypes('evt-nope')).toEqual([]);
    expect(await adapter.listGuests('evt-nope')).toEqual({ entries: [], nextCursor: null });
  });

  it('rejects malformed cursors', async () => {
    await expect(adapter.listGuests(first.event.id, { cursor: 'garbage' })).rejects.toThrow(/Invalid cursor/);
  });
});

describe('createLumaAdapter', () => {
  it('defaults to mock mode without an API key', () => {
    expect(createLumaAdapter({}).mode).toBe('mock');
    expect(createLumaAdapter({ LUMA_MODE: ' MOCK ' }).mode).toBe('mock');
  });

  it('validates the mode and requires a key for live', () => {
    expect(() => createLumaAdapter({ LUMA_MODE: 'prod' })).toThrow(/LUMA_MODE/);
    expect(() => createLumaAdapter({ LUMA_MODE: 'live' })).toThrow(/LUMA_API_KEY/);
    expect(createLumaAdapter({ LUMA_MODE: 'live', LUMA_API_KEY: 'k' })).toBeInstanceOf(LiveLumaAdapter);
  });
});

describe('Luma schemas', () => {
  it('strip any payment fields and normalise email', () => {
    const parsed = LumaGuestSchema.parse({
      id: 'gst-1',
      eventId: 'evt-1',
      guestKey: 'g-1',
      name: 'A',
      email: ' Someone@Example.COM ',
      approvalStatus: 'approved',
      amount: 4500,
      currency: 'usd',
      tickets: [{ id: 'evtticket-1', ticketTypeId: 't', ticketTypeName: 'GA', amount_paid: 4500 }],
    });
    expect(parsed.email).toBe('someone@example.com');
    expect(JSON.stringify(parsed)).not.toMatch(/amount|currency/);
  });
});
