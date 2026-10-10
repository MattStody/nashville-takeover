import { describe, expect, it } from 'vitest';
import { generateMockDataset, MockLumaAdapter, runBackfill, type BackfillProgress, type SyncStore } from '../src/index.ts';

function memoryStore() {
  const guests = new Map<string, number>();
  const progress: BackfillProgress[] = [];
  let typeCalls = 0;
  const store: SyncStore = {
    async upsertTicketTypes() {
      typeCalls++;
    },
    async upsertGuests(_eventId, page) {
      for (const g of page) guests.set(g.id, (guests.get(g.id) ?? 0) + 1);
      return { guests: page.length, tickets: page.reduce((n, g) => n + g.tickets.length, 0) };
    },
    async saveProgress(p) {
      progress.push(p);
    },
  };
  return { store, guests, progress, typeCalls: () => typeCalls };
}

describe('runBackfill', () => {
  const dataset = generateMockDataset();
  const mock = dataset.events[0]!;
  const event = { id: 'our-event', lumaEventId: mock.event.id };
  const totalTickets = mock.guests.reduce((n, g) => n + g.tickets.length, 0);

  it('syncs ticket types then every guest exactly once', async () => {
    const m = memoryStore();
    const result = await runBackfill({
      adapter: new MockLumaAdapter(dataset),
      store: m.store,
      event,
      runId: 'r1',
      cursor: null,
      deadline: Number.POSITIVE_INFINITY,
      pageSize: 7,
    });
    expect(result).toEqual({ runId: 'r1', cursor: null, guests: mock.guests.length, tickets: totalTickets, done: true });
    expect(m.typeCalls()).toBe(1);
    expect(m.guests.size).toBe(mock.guests.length);
    expect([...m.guests.values()].every((n) => n === 1)).toBe(true);
    expect(m.progress.at(-1)?.done).toBe(true);
  });

  it('stops at the deadline and resumes from the saved cursor without repeats', async () => {
    const m = memoryStore();
    let clock = 0;
    const adapter = new MockLumaAdapter(dataset);
    // Each page "takes" 10ms; the deadline allows three pages.
    const tick = { now: () => (clock += 10) - 10 };
    const first = await runBackfill({ adapter, store: m.store, event, runId: 'r2', cursor: null, deadline: 30, pageSize: 10, ...tick });
    expect(first.done).toBe(false);
    expect(first.cursor).not.toBeNull();
    expect(m.guests.size).toBe(30);

    const second = await runBackfill({
      adapter,
      store: m.store,
      event,
      runId: 'r2',
      cursor: first.cursor,
      totals: { guests: first.guests, tickets: first.tickets },
      deadline: Number.POSITIVE_INFINITY,
      pageSize: 10,
    });
    expect(second.done).toBe(true);
    expect(second.guests).toBe(mock.guests.length);
    expect(second.tickets).toBe(totalTickets);
    expect(m.typeCalls()).toBe(1);
    expect([...m.guests.values()].every((n) => n === 1)).toBe(true);
  });
});
