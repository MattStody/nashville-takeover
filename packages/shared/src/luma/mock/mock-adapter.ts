import type { LumaAdapter, LumaAdapterCapabilities } from '../adapter.ts';
import type { GuestLookup, LumaEvent, LumaGuest, LumaTicketType, Page } from '../types.ts';
import { generateMockDataset, type MockDataset, type MockEvent } from './fixtures.ts';

const DEFAULT_PAGE_SIZE = 50;

/** In-memory Luma backed by the deterministic mock dataset. */
export class MockLumaAdapter implements LumaAdapter {
  readonly mode = 'mock' as const;
  readonly capabilities: LumaAdapterCapabilities = { checkInWriteBack: false };
  private readonly byId: Map<string, MockEvent>;

  constructor(dataset: MockDataset = generateMockDataset()) {
    this.byId = new Map(dataset.events.map((e) => [e.event.id, e]));
  }

  async getEvent(eventId: string): Promise<LumaEvent | null> {
    return this.byId.get(eventId)?.event ?? null;
  }

  async listTicketTypes(eventId: string): Promise<LumaTicketType[]> {
    return this.byId.get(eventId)?.ticketTypes ?? [];
  }

  async listGuests(
    eventId: string,
    opts: { cursor?: string | null; limit?: number } = {},
  ): Promise<Page<LumaGuest>> {
    const guests = this.byId.get(eventId)?.guests ?? [];
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, 100));
    const offset = opts.cursor ? decodeCursor(opts.cursor) : 0;
    const entries = guests.slice(offset, offset + limit);
    const next = offset + entries.length;
    return { entries, nextCursor: next < guests.length ? encodeCursor(next) : null };
  }

  async getGuest(eventId: string, lookup: GuestLookup): Promise<LumaGuest | null> {
    const guests = this.byId.get(eventId)?.guests ?? [];
    const match = guests.find((g) => {
      if ('guestId' in lookup) return g.id === lookup.guestId;
      if ('guestKey' in lookup) return g.guestKey === lookup.guestKey;
      if ('ticketKey' in lookup) return g.tickets.some((t) => t.ticketKey === lookup.ticketKey);
      return g.email === lookup.email.trim().toLowerCase();
    });
    return match ?? null;
  }
}

function encodeCursor(offset: number): string {
  return `mock:${offset}`;
}

function decodeCursor(cursor: string): number {
  const match = /^mock:(\d+)$/.exec(cursor);
  if (!match) throw new Error(`Invalid cursor: ${cursor}`);
  return Number(match[1]);
}
