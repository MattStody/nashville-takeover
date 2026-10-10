import { z } from 'zod';

// Normalised Luma shapes. These are what the rest of the system consumes, no
// matter which adapter produced them. The live adapter (Phase 2) maps raw API
// responses through these schemas; z.object() strips unknown keys, so any
// payment fields in a Luma payload never make it past this boundary.

export const LumaEventSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  timezone: z.string(),
});
export type LumaEvent = z.infer<typeof LumaEventSchema>;

export const LumaTicketTypeSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  name: z.string(),
  isHidden: z.boolean(),
});
export type LumaTicketType = z.infer<typeof LumaTicketTypeSchema>;

// Luma's API exposes each ticket's id but not its ticket key (the value in a
// per-ticket QR code). Keys are learned when a scan is resolved online.
export const LumaTicketSchema = z.object({
  id: z.string().min(1),
  ticketTypeId: z.string().min(1),
  /** Ticket type name as Luma reports it on the ticket. */
  ticketTypeName: z.string(),
});
export type LumaTicket = z.infer<typeof LumaTicketSchema>;

export const LumaGuestSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  /** Guest key, starts with "g-". Taken from the guest's check-in QR code. */
  guestKey: z.string().regex(/^g-/),
  name: z.string().nullable(),
  email: z.string().trim().toLowerCase().email(),
  /** approved, pending_approval, invited, declined, waitlist or session. Only approved guests can check in. */
  approvalStatus: z.string(),
  tickets: z.array(LumaTicketSchema),
});
export type LumaGuest = z.infer<typeof LumaGuestSchema>;

export interface Page<T> {
  entries: T[];
  /** Pass back as `cursor` to fetch the next page; null when done. */
  nextCursor: string | null;
}

/**
 * Any identifier Luma's guests/get accepts: guest id (gst-), guest key (g-),
 * ticket key, or email.
 */
export type GuestLookup = string;
