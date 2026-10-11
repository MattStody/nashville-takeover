import { describe, expect, it } from 'vitest';
import { formatInZone, isValidTimeZone, localInputToUtc, utcToLocalInput } from '../src/time.ts';

describe('time helpers', () => {
  it('converts Nashville wall clock to UTC across standard and daylight time', () => {
    expect(localInputToUtc('2026-11-13T19:30', 'America/Chicago')).toBe('2026-11-14T01:30:00.000Z'); // CST
    expect(localInputToUtc('2026-07-04T19:30', 'America/Chicago')).toBe('2026-07-05T00:30:00.000Z'); // CDT
    expect(localInputToUtc('2026-04-10T19:00', 'America/Toronto')).toBe('2026-04-10T23:00:00.000Z');
  });

  it('round-trips', () => {
    for (const tz of ['America/Chicago', 'America/Toronto', 'Europe/London', 'Asia/Kolkata', 'UTC']) {
      const iso = localInputToUtc('2026-11-01T01:30', tz)!;
      expect(utcToLocalInput(iso, tz)).toBe('2026-11-01T01:30');
    }
  });

  it('handles the spring-forward gap without throwing', () => {
    // 2:30 does not exist on 2026-03-08 in Chicago.
    expect(localInputToUtc('2026-03-08T02:30', 'America/Chicago')).toMatch(/^2026-03-08T0[78]:30:00\.000Z$/);
  });

  it('rejects malformed input and bad zones', () => {
    expect(localInputToUtc('nope', 'America/Chicago')).toBeNull();
    expect(localInputToUtc('2026-13-45T99:99', 'America/Chicago')).toBeNull();
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('formats in the event timezone', () => {
    expect(formatInZone('2026-11-14T01:30:00.000Z', 'America/Chicago')).toBe('Fri, Nov 13, 7:30 PM CST');
  });
});
