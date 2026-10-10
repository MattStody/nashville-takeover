// GENERATED from packages/shared/src by `pnpm functions:vendor`. Do not edit.
import type { LumaAdapter } from '../luma/adapter.ts';
import type { LumaGuest, LumaTicketType } from '../luma/types.ts';

/** Where synced Luma data is written. The edge functions back this with RPCs. */
export interface SyncStore {
  upsertTicketTypes(eventId: string, types: LumaTicketType[]): Promise<void>;
  upsertGuests(eventId: string, guests: LumaGuest[]): Promise<{ guests: number; tickets: number }>;
  /** Persists progress so a run interrupted by a timeout can resume. */
  saveProgress(progress: BackfillProgress): Promise<void>;
}

export interface BackfillProgress {
  runId: string;
  cursor: string | null;
  guests: number;
  tickets: number;
  done: boolean;
}

export interface BackfillInput {
  adapter: LumaAdapter;
  store: SyncStore;
  /** Our event id and its Luma event id. */
  event: { id: string; lumaEventId: string };
  runId: string;
  /** Resume point from a previous partial run; null starts from the beginning. */
  cursor: string | null;
  /** Counts carried over from earlier partial runs. */
  totals?: { guests: number; tickets: number };
  /** Stop starting new pages after this time (ms epoch). */
  deadline: number;
  now?: () => number;
  pageSize?: number;
}

/**
 * Pages through every guest of one event and upserts them. Ticket types are
 * synced first (on a fresh run) so tickets resolve to named types. Stops at the
 * deadline and returns the cursor, so edge function time limits never lose
 * progress: the caller re-invokes with the same run to continue.
 */
export async function runBackfill(input: BackfillInput): Promise<BackfillProgress> {
  const now = input.now ?? Date.now;
  let cursor = input.cursor;
  let guests = input.totals?.guests ?? 0;
  let tickets = input.totals?.tickets ?? 0;

  if (cursor === null) {
    const types = await input.adapter.listTicketTypes(input.event.lumaEventId);
    await input.store.upsertTicketTypes(input.event.id, types);
  }

  do {
    if (now() >= input.deadline) {
      const partial = { runId: input.runId, cursor, guests, tickets, done: false };
      await input.store.saveProgress(partial);
      return partial;
    }
    const page = await input.adapter.listGuests(input.event.lumaEventId, {
      cursor,
      limit: input.pageSize ?? 50,
    });
    if (page.entries.length > 0) {
      const counts = await input.store.upsertGuests(input.event.id, page.entries);
      guests += counts.guests;
      tickets += counts.tickets;
    }
    cursor = page.nextCursor;
    if (cursor) await input.store.saveProgress({ runId: input.runId, cursor, guests, tickets, done: false });
  } while (cursor);

  const done = { runId: input.runId, cursor: null, guests, tickets, done: true };
  await input.store.saveProgress(done);
  return done;
}
