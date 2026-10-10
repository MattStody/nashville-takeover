import type { LumaGuest } from '../types.ts';
import { normalizeGuest } from './live-adapter.ts';
import { GUEST_WEBHOOK_TYPES, RawWebhookEnvelopeSchema, RawWebhookGuestSchema, type GuestWebhookType } from './raw.ts';

export type ParsedLumaWebhook =
  | { kind: 'guest'; type: GuestWebhookType; lumaEventId: string; guest: LumaGuest }
  | { kind: 'ignored'; type: string };

/**
 * Parses a Luma webhook body. guest.registered, guest.updated and
 * ticket.registered all carry a full guest (with event_tickets and event); any
 * other type is acknowledged and ignored. Throws on a malformed guest payload.
 */
export function parseLumaWebhook(body: unknown): ParsedLumaWebhook {
  const envelope = RawWebhookEnvelopeSchema.parse(body);
  if (!(GUEST_WEBHOOK_TYPES as readonly string[]).includes(envelope.type)) {
    return { kind: 'ignored', type: envelope.type };
  }
  const raw = RawWebhookGuestSchema.parse(envelope.data);
  return {
    kind: 'guest',
    type: envelope.type as GuestWebhookType,
    lumaEventId: raw.event.id,
    guest: normalizeGuest(raw, raw.event.id),
  };
}

/** Stable id for de-duplicating deliveries (Luma sends no delivery id). */
export async function webhookReceiptId(rawBody: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison for the webhook URL token. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
