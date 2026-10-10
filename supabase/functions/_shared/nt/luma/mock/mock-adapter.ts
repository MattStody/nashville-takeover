// GENERATED from packages/shared/src by `pnpm functions:vendor`. Do not edit.
import type { LumaAdapter, LumaAdapterCapabilities } from '../adapter.ts';
import type { GuestLookup, LumaEvent, LumaGuest, LumaTicketType, LumaWebhook, Page } from '../types.ts';
import { generateMockDataset, type MockDataset, type MockEvent } from './fixtures.ts';

const DEFAULT_PAGE_SIZE = 50;

/** In-memory Luma backed by the deterministic mock dataset. */
export class MockLumaAdapter implements LumaAdapter {
  readonly mode = 'mock' as const;
  readonly capabilities: LumaAdapterCapabilities = { checkInWriteBack: false };
  private readonly byId: Map<string, MockEvent>;
  private readonly webhooks: LumaWebhook[] = [];

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

  /** Mirrors guests/get: accepts a guest id, guest key, ticket key or email. */
  async getGuest(eventId: string, lookup: GuestLookup): Promise<LumaGuest | null> {
    const mock = this.byId.get(eventId);
    if (!mock) return null;
    const id = lookup.trim();
    const ticketId = mock.ticketKeys[id];
    const match = mock.guests.find(
      (g) =>
        g.id === id ||
        g.guestKey === id ||
        g.email === id.toLowerCase() ||
        (ticketId !== undefined && g.tickets.some((t) => t.id === ticketId)),
    );
    return match ?? null;
  }

  async listWebhooks(): Promise<LumaWebhook[]> {
    return [...this.webhooks];
  }

  async createWebhook(url: string, eventTypes: readonly string[]): Promise<LumaWebhook> {
    const webhook = { id: `wh-mock-${this.webhooks.length + 1}`, url, eventTypes: [...eventTypes], status: 'active' };
    this.webhooks.push(webhook);
    return webhook;
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
