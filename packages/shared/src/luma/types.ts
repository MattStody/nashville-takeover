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

export const LumaTicketSchema = z.object({
  ticketKey: z.string().min(1),
  ticketTypeId: z.string().min(1),
  /** 'active' or 'cancelled'. Live values are confirmed against the docs in Phase 2. */
  status: z.string(),
});
export type LumaTicket = z.infer<typeof LumaTicketSchema>;

export const LumaGuestSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  /** Guest key, starts with "g-". Used in Luma's check-in QR codes. */
  guestKey: z.string().min(1),
  name: z.string().nullable(),
  email: z.string().trim().toLowerCase().email(),
  /** e.g. approved, pending_approval, declined, waitlist. Only approved guests can check in. */
  approvalStatus: z.string(),
  tickets: z.array(LumaTicketSchema),
});
export type LumaGuest = z.infer<typeof LumaGuestSchema>;

export interface Page<T> {
  entries: T[];
  /** Pass back as `cursor` to fetch the next page; null when done. */
  nextCursor: string | null;
}

/** Luma's guests/get accepts any one of these identifiers. */
export type GuestLookup =
  | { guestId: string }
  | { guestKey: string }
  | { ticketKey: string }
  | { email: string };
