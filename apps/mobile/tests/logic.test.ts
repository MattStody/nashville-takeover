import { describe, expect, it } from 'vitest';
import {
  groupLineupByDay,
  normalizeCode,
  normalizeEmail,
  perkWindow,
  pickDefaultEvent,
  setStatus,
  summarizePerks,
  timeRange,
} from '@/lib/logic';

const NOW = Date.parse('2026-11-14T02:00:00Z'); // Fri 8pm in Chicago
const ev = (id: string, start: string, end: string) => ({ id, name: id, starts_at: start, ends_at: end, timezone: 'America/Chicago' });

describe('pickDefaultEvent', () => {
  const past = ev('past', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
  const live = ev('live', '2026-11-14T00:00:00Z', '2026-11-14T06:00:00Z');
  const later = ev('later', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z');

  it('prefers the guest’s event that is on now or next', () => {
    expect(pickDefaultEvent([later, past, live], [], NOW)?.id).toBe('live');
    expect(pickDefaultEvent([later, past], [], NOW)?.id).toBe('later');
  });
  it('falls back to their latest past event, then published events', () => {
    expect(pickDefaultEvent([past], [later], NOW)?.id).toBe('past');
    expect(pickDefaultEvent([], [past, later], NOW)?.id).toBe('later');
    expect(pickDefaultEvent([], [], NOW)).toBeNull();
  });
});

describe('lineup', () => {
  const items = [
    { id: 'b', artist: 'B', stage: 'Main', starts_at: '2026-11-15T01:00:00Z', ends_at: '2026-11-15T02:00:00Z' },
    { id: 'a', artist: 'A', stage: 'Main', starts_at: '2026-11-14T01:00:00Z', ends_at: '2026-11-14T02:00:00Z' },
    { id: 'c', artist: 'C', stage: 'Back Room', starts_at: '2026-11-14T01:00:00Z', ends_at: '2026-11-14T01:45:00Z' },
  ];

  it('groups by local day and orders by time then stage', () => {
    const days = groupLineupByDay(items, 'America/Chicago');
    expect(days.map((d) => d.day)).toEqual(['Friday, November 13', 'Saturday, November 14']);
    expect(days[0]!.items.map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('formats ranges and live status in the event timezone', () => {
    expect(timeRange(items[1]!.starts_at, items[1]!.ends_at, 'America/Chicago')).toBe('7:00 PM – 8:00 PM');
    expect(setStatus(items[1]!, NOW)).toBe('done');
    expect(setStatus({ starts_at: '2026-11-14T01:30:00Z', ends_at: '2026-11-14T03:00:00Z' }, NOW)).toBe('live');
    expect(setStatus(items[0]!, NOW)).toBe('upcoming');
  });
});

describe('summarizePerks', () => {
  it('adds up perks across tickets and never shows negative balances', () => {
    const rows = [
      { ticket_id: 't1', perk_id: 'drink', perk_name: 'Drink', allowance: 2, used: 3, remaining: -1, valid_from: null, valid_until: null },
      { ticket_id: 't2', perk_id: 'drink', perk_name: 'Drink', allowance: 1, used: 0, remaining: 1, valid_from: null, valid_until: null },
      { ticket_id: 't1', perk_id: 'merch', perk_name: 'Merch', allowance: 1, used: 0, remaining: 1, valid_from: '2026-11-15T00:00:00Z', valid_until: null },
    ];
    expect(summarizePerks(rows, NOW)).toEqual([
      expect.objectContaining({ perkId: 'drink', allowance: 3, remaining: 1, window: 'open' }),
      expect.objectContaining({ perkId: 'merch', allowance: 1, remaining: 1, window: 'not_yet' }),
    ]);
  });

  it('knows when a perk window has ended', () => {
    expect(perkWindow(null, '2026-11-14T01:00:00Z', NOW)).toBe('ended');
  });
});

describe('sign-in input', () => {
  it('normalises emails and codes', () => {
    expect(normalizeEmail('  Matt@Example.COM ')).toBe('matt@example.com');
    expect(normalizeEmail('nope')).toBeNull();
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('12345')).toBeNull();
  });
});
