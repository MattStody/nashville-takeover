import { formatInZone } from '@nt/shared';

export interface EventSummary {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
}

/**
 * The event to open by default: the guest's own event that is on now or
 * starts soonest; failing that, their most recent past event; failing that,
 * the next published event.
 */
export function pickDefaultEvent<E extends EventSummary>(mine: E[], published: E[], now = Date.now()): E | null {
  const upcoming = (list: E[]) =>
    list.filter((e) => Date.parse(e.ends_at) >= now).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const past = (list: E[]) =>
    list.filter((e) => Date.parse(e.ends_at) < now).sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at));
  return upcoming(mine)[0] ?? past(mine)[0] ?? upcoming(published)[0] ?? past(published)[0] ?? null;
}

export interface LineupItem {
  id: string;
  artist: string;
  stage: string;
  starts_at: string;
  ends_at: string;
}

/** Groups sets by calendar day in the event's timezone, each day sorted by start then stage. */
export function groupLineupByDay<T extends LineupItem>(items: T[], timeZone: string): { day: string; items: T[] }[] {
  const days = new Map<string, T[]>();
  const sorted = [...items].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.stage.localeCompare(b.stage),
  );
  for (const item of sorted) {
    const day = formatInZone(item.starts_at, timeZone, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: undefined,
      minute: undefined,
      timeZoneName: undefined,
    });
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return [...days].map(([day, list]) => ({ day, items: list }));
}

/** "7:30 – 8:15 PM" style range in the event's timezone. */
export function timeRange(startIso: string, endIso: string, timeZone: string): string {
  const t = (iso: string) =>
    formatInZone(iso, timeZone, { weekday: undefined, month: undefined, day: undefined, timeZoneName: undefined });
  return `${t(startIso)} – ${t(endIso)}`;
}

export type SetStatus = 'upcoming' | 'live' | 'done';
export function setStatus(item: { starts_at: string; ends_at: string }, now = Date.now()): SetStatus {
  if (now < Date.parse(item.starts_at)) return 'upcoming';
  if (now < Date.parse(item.ends_at)) return 'live';
  return 'done';
}

export interface PerkBalanceRow {
  ticket_id: string | null;
  perk_id: string | null;
  perk_name: string | null;
  allowance: number | null;
  used: number | null;
  remaining: number | null;
  valid_from: string | null;
  valid_until: string | null;
}

export interface PerkSummary {
  perkId: string;
  name: string;
  allowance: number;
  remaining: number;
  window: 'open' | 'not_yet' | 'ended';
  validFrom: string | null;
  validUntil: string | null;
}

/** One line per perk across all of a guest's tickets. Over-limit offline redemptions never show below zero. */
export function summarizePerks(rows: PerkBalanceRow[], now = Date.now()): PerkSummary[] {
  const byPerk = new Map<string, PerkSummary>();
  for (const r of rows) {
    if (!r.perk_id) continue;
    const s = byPerk.get(r.perk_id) ?? {
      perkId: r.perk_id,
      name: r.perk_name ?? 'Perk',
      allowance: 0,
      remaining: 0,
      window: perkWindow(r.valid_from, r.valid_until, now),
      validFrom: r.valid_from,
      validUntil: r.valid_until,
    };
    s.allowance += r.allowance ?? 0;
    s.remaining += Math.max(0, r.remaining ?? 0);
    byPerk.set(r.perk_id, s);
  }
  return [...byPerk.values()];
}

export function perkWindow(from: string | null, until: string | null, now = Date.now()): PerkSummary['window'] {
  if (from && now < Date.parse(from)) return 'not_yet';
  if (until && now > Date.parse(until)) return 'ended';
  return 'open';
}

/** Basic email check for the sign-in form (the server validates too). */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Sign-in codes are 6–10 digits depending on project settings. */
export function normalizeCode(input: string): string | null {
  const code = input.replace(/\D/g, '');
  return code.length >= 6 && code.length <= 10 ? code : null;
}
