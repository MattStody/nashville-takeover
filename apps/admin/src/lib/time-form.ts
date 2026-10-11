import { localInputToUtc } from '@nt/shared';

/**
 * Converts form "datetime-local" values (wall clock in the event's timezone)
 * to UTC ISO strings. Returns an error message instead when invalid.
 */
export function wallTimesToUtc<K extends string>(
  values: Record<K, string | undefined>,
  timeZone: string,
): { ok: true; value: Record<K, string | null> } | { ok: false; message: string } {
  const out = {} as Record<K, string | null>;
  for (const key of Object.keys(values) as K[]) {
    const raw = values[key];
    if (!raw) {
      out[key] = null;
      continue;
    }
    const iso = localInputToUtc(raw, timeZone);
    if (!iso) return { ok: false, message: `${key.replace(/_/g, ' ')}: not a valid date and time` };
    out[key] = iso;
  }
  return { ok: true, value: out };
}

/** Both set and start after end -> error message. */
export function checkOrder(start: string | null, end: string | null, label = 'End'): string | null {
  if (start && end && Date.parse(end) <= Date.parse(start)) return `${label} must be after the start.`;
  return null;
}
