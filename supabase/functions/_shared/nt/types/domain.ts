// GENERATED from packages/shared/src by `pnpm functions:vendor`. Do not edit.
// Domain enums and row shapes mirrored from supabase/migrations. Once the
// Supabase project is linked, generated types (`supabase gen types`) are added
// alongside these in types/database.ts and these become thin aliases.

export const EVENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const STAFF_ROLES = ['staff', 'manager'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Effective role of a user for one event. Guests hold no stored role. */
export type AppRole = 'guest' | StaffRole | 'admin';

export const OP_SOURCES = ['online', 'offline', 'manual'] as const;
export type OpSource = (typeof OP_SOURCES)[number];

export const REDEMPTION_KINDS = ['redeem', 'adjust'] as const;
export type RedemptionKind = (typeof REDEMPTION_KINDS)[number];

export const CONTENT_KINDS = ['faq', 'info', 'map'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export interface EventRow {
  id: string;
  luma_event_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  status: EventStatus;
  hero_image_path: string | null;
  logo_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
}

export interface TicketTypeRow {
  id: string;
  event_id: string;
  luma_ticket_type_id: string;
  name: string;
  is_hidden: boolean;
  sort_order: number;
}

export interface GuestRow {
  id: string;
  event_id: string;
  luma_guest_id: string;
  guest_key: string;
  name: string | null;
  email: string;
  approval_status: string;
  user_id: string | null;
}

export interface TicketRow {
  id: string;
  event_id: string;
  guest_id: string;
  ticket_type_id: string;
  luma_ticket_id: string;
  /** Learned when a per-ticket QR is resolved online; Luma's API does not expose it. */
  ticket_key: string | null;
  status: 'active' | 'invalidated';
}

export interface LumaSyncRunRow {
  id: string;
  event_id: string;
  trigger: 'manual' | 'cron' | 'webhook';
  status: 'running' | 'succeeded' | 'failed';
  started_by: string | null;
  started_at: string;
  finished_at: string | null;
  guests_upserted: number;
  tickets_upserted: number;
  cursor: string | null;
  updated_at: string;
  error: string | null;
}

/** Row of resolve_check_in_key. */
export interface ResolvedCheckInKey {
  ticket_id: string;
  guest_id: string;
  matched_by: 'guest_key' | 'ticket_key' | 'alias';
}

export type EventRoleName = 'admin' | 'manager' | 'staff' | 'guest';

export interface PerkRow {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  valid_from: string | null;
  valid_until: string | null;
  sort_order: number;
}

/** Row of the ticket_perk_balances view. */
export interface TicketPerkBalance {
  ticket_id: string;
  event_id: string;
  perk_id: string;
  perk_name: string;
  valid_from: string | null;
  valid_until: string | null;
  allowance: number;
  used: number;
  /** Negative when offline redemptions went over the allowance. */
  remaining: number;
}

/** Row of the ticket_check_in_status view. */
export interface TicketCheckInStatus {
  ticket_id: string;
  event_id: string;
  check_in_id: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  checked_in_device_id: string | null;
  checked_in_source: OpSource | null;
  scan_count: number;
}

/** Result of the record_check_in RPC. */
export interface CheckInResult {
  check_in_id: string;
  op_id: string;
  is_new: boolean;
  /** False when the ticket was already checked in by an earlier scan. */
  is_effective: boolean;
  checked_in_at: string;
  checked_in_by: string;
  checked_in_by_name: string | null;
}

/** Result of the record_perk_redemption and adjust_perk RPCs. */
export interface RedemptionResult {
  redemption_id: string;
  op_id: string;
  is_new: boolean;
  remaining: number;
}

/** Error messages raised by the RPCs (Postgres error message text). */
export const RPC_ERRORS = [
  'not_authenticated',
  'not_event_staff',
  'not_event_manager',
  'ticket_not_found',
  'ticket_not_valid',
  'op_id_reused',
  'reason_required',
  'invalid_quantity',
  'perk_not_found',
  'perk_not_included',
  'perk_outside_window',
  'perk_exhausted',
  'check_in_not_found',
  'event_not_found',
  'guest_not_found',
] as const;
export type RpcError = (typeof RPC_ERRORS)[number];
