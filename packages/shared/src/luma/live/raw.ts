import { z } from 'zod';

// Raw Luma API shapes, written against https://public-api.luma.com/openapi.json
// (fetched 2026-10-10). Only fields we use are declared; z.object() drops the
// rest, so ticket amounts, currency, orders, coupons, phone numbers and
// registration answers never leave this module.

export const RawTicketSchema = z.object({
  id: z.string().min(1),
  event_ticket_type_id: z.string().min(1),
  /** Ticket type name. */
  name: z.string(),
});

export const RawGuestSchema = z.object({
  /** Guest id, "gst-...". */
  id: z.string().min(1),
  user_email: z.string(),
  user_name: z.string().nullish(),
  user_first_name: z.string().nullish(),
  user_last_name: z.string().nullish(),
  approval_status: z.string(),
  /** The guest's check-in QR payload; carries the guest key. */
  check_in_qr_code: z.string(),
  event_tickets: z.array(RawTicketSchema),
});
export type RawGuest = z.infer<typeof RawGuestSchema>;

export const RawGuestListSchema = z.object({
  entries: z.array(RawGuestSchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullish(),
});

export const RawTicketTypeListSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      is_hidden: z.boolean().optional(),
    }),
  ),
});

export const RawEventSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  start_at: z.string(),
  end_at: z.string(),
  timezone: z.string(),
});

/** Webhook guest payloads also carry the event they belong to. */
export const RawWebhookGuestSchema = RawGuestSchema.extend({
  event: z.object({ id: z.string().min(1) }),
});

export const GUEST_WEBHOOK_TYPES = ['guest.registered', 'guest.updated', 'ticket.registered'] as const;
export type GuestWebhookType = (typeof GUEST_WEBHOOK_TYPES)[number];

export const RawWebhookEnvelopeSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

// Webhook endpoints. The per-webhook `secret` is deliberately not declared, so
// it is dropped here and never logged or stored.
export const RawWebhookSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  event_types: z.array(z.string()),
  status: z.string().optional(),
});

export const RawWebhookListSchema = z.object({
  entries: z.array(RawWebhookSchema),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullish(),
});
