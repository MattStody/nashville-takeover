// GENERATED from packages/shared/src by `pnpm functions:vendor`. Do not edit.
import type { LumaAdapter, LumaAdapterCapabilities } from '../adapter.ts';
import type { GuestLookup, LumaEvent, LumaGuest, LumaTicketType, LumaWebhook, Page } from '../types.ts';
import { LumaGuestSchema } from '../types.ts';
import { parseCheckInQr } from '../../qr/parse.ts';
import { LumaContractError, LumaHttp, type LumaHttpOptions } from './http.ts';
import {
  RawEventSchema,
  RawGuestListSchema,
  RawGuestSchema,
  RawTicketTypeListSchema,
  RawWebhookListSchema,
  RawWebhookSchema,
  type RawGuest,
} from './raw.ts';

const PAGE_SIZE = 50;

/** Extracts the guest key from a guest's check_in_qr_code. */
export function guestKeyFromQr(checkInQrCode: string): string | null {
  const value = checkInQrCode.trim();
  if (value.startsWith('g-')) return value;
  const parsed = parseCheckInQr(value);
  return parsed.ok && parsed.value.kind === 'guest' ? parsed.value.key : null;
}

export function normalizeGuest(raw: RawGuest, lumaEventId: string): LumaGuest {
  const guestKey = guestKeyFromQr(raw.check_in_qr_code);
  if (!guestKey) {
    throw new LumaContractError('guest', `guest ${raw.id} has no guest key in check_in_qr_code`);
  }
  const fullName =
    raw.user_name?.trim() ||
    [raw.user_first_name, raw.user_last_name].filter((p) => p && p.trim()).join(' ').trim() ||
    null;
  return LumaGuestSchema.parse({
    id: raw.id,
    eventId: lumaEventId,
    guestKey,
    name: fullName,
    email: raw.user_email,
    approvalStatus: raw.approval_status,
    tickets: raw.event_tickets.map((t) => ({
      id: t.id,
      ticketTypeId: t.event_ticket_type_id,
      ticketTypeName: t.name,
    })),
  });
}

/**
 * Talks to the real Luma API. Endpoints verified against the docs and
 * changelog on 2026-10-10 (the June 2026 flat-response routes).
 */
export class LiveLumaAdapter implements LumaAdapter {
  readonly mode = 'live' as const;
  // Luma's API has no endpoint for setting check-in status, so check-ins stay
  // in our database. See DECISIONS.md.
  readonly capabilities: LumaAdapterCapabilities = { checkInWriteBack: false };
  private readonly http: LumaHttp;

  constructor(opts: LumaHttpOptions) {
    this.http = new LumaHttp(opts);
  }

  async getEvent(eventId: string): Promise<LumaEvent | null> {
    const raw = await this.http.get('/v1/events/get', { event_id: eventId }, RawEventSchema, { allowNotFound: true });
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name,
      startAt: new Date(raw.start_at).toISOString(),
      endAt: new Date(raw.end_at).toISOString(),
      timezone: raw.timezone,
    };
  }

  async listTicketTypes(eventId: string): Promise<LumaTicketType[]> {
    const raw = await this.http.get(
      '/v1/events/ticket-types/list',
      { event_id: eventId, include_hidden: 'true' },
      RawTicketTypeListSchema,
    );
    return (raw?.entries ?? []).map((t) => ({
      id: t.id,
      eventId,
      name: t.name,
      isHidden: t.is_hidden ?? false,
    }));
  }

  async listGuests(
    eventId: string,
    opts: { cursor?: string | null; limit?: number } = {},
  ): Promise<Page<LumaGuest>> {
    const raw = await this.http.get(
      '/v1/events/guests/list',
      {
        event_id: eventId,
        pagination_cursor: opts.cursor ?? undefined,
        pagination_limit: opts.limit ?? PAGE_SIZE,
        sort_column: 'created_at',
        sort_direction: 'asc',
      },
      RawGuestListSchema,
    );
    if (!raw) return { entries: [], nextCursor: null };
    return {
      entries: raw.entries.map((g) => normalizeGuest(g, eventId)),
      nextCursor: raw.has_more && raw.next_cursor ? raw.next_cursor : null,
    };
  }

  async getGuest(eventId: string, lookup: GuestLookup): Promise<LumaGuest | null> {
    const raw = await this.http.get(
      '/v1/events/guests/get',
      { event_id: eventId, id: lookup },
      RawGuestSchema,
      { allowNotFound: true },
    );
    return raw ? normalizeGuest(raw, eventId) : null;
  }

  async listWebhooks(): Promise<LumaWebhook[]> {
    const out: LumaWebhook[] = [];
    let cursor: string | undefined;
    do {
      const raw = await this.http.get(
        '/v1/webhooks/list',
        { pagination_cursor: cursor, pagination_limit: 50 },
        RawWebhookListSchema,
      );
      for (const w of raw?.entries ?? []) {
        out.push({ id: w.id, url: w.url, eventTypes: w.event_types, status: w.status ?? null });
      }
      cursor = raw?.has_more && raw.next_cursor ? raw.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  async createWebhook(url: string, eventTypes: readonly string[]): Promise<LumaWebhook> {
    const w = await this.http.post('/v2/webhooks/create', { url, event_types: eventTypes }, RawWebhookSchema);
    return { id: w.id, url: w.url, eventTypes: w.event_types, status: w.status ?? null };
  }
}
