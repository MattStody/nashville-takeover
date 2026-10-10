// GENERATED from packages/shared/src by `pnpm functions:vendor`. Do not edit.
import type { GuestLookup, LumaEvent, LumaGuest, LumaTicketType, LumaWebhook, Page } from './types.ts';

export type LumaMode = 'mock' | 'live';

export interface LumaAdapterCapabilities {
  /** Whether check-ins can be written back to Luma. The live API cannot (Phase 2 finding). */
  checkInWriteBack: boolean;
}

/**
 * Everything the backend needs from Luma. Edge functions depend on this
 * interface only; LUMA_MODE picks the implementation.
 */
export interface LumaAdapter {
  readonly mode: LumaMode;
  readonly capabilities: LumaAdapterCapabilities;
  getEvent(eventId: string): Promise<LumaEvent | null>;
  listTicketTypes(eventId: string): Promise<LumaTicketType[]>;
  listGuests(eventId: string, opts?: { cursor?: string | null; limit?: number }): Promise<Page<LumaGuest>>;
  getGuest(eventId: string, lookup: GuestLookup): Promise<LumaGuest | null>;
  listWebhooks(): Promise<LumaWebhook[]>;
  createWebhook(url: string, eventTypes: readonly string[]): Promise<LumaWebhook>;
}
