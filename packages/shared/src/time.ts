// Converts between UTC instants and wall-clock times in an event's IANA
// timezone, with no date library. Used for <input type="datetime-local">,
// which has no timezone of its own.

function partsInZone(utcMs: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset of `timeZone` from UTC at the given instant, in ms (e.g. -5h for Chicago in summer). */
export function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const p = partsInZone(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "2026-11-13T19:30" in `timeZone` -> ISO UTC string. During a DST gap the
 * earlier valid offset wins; returns null for malformed input.
 */
export function localInputToUtc(value: string, timeZone: string): string | null {
  const m = LOCAL_INPUT.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const check = new Date(wall);
  // Date.UTC silently rolls over (month 13, hour 25); reject those.
  if (
    Number.isNaN(wall) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d) ||
    check.getUTCHours() !== Number(h) ||
    check.getUTCMinutes() !== Number(mi)
  ) {
    return null;
  }
  // Two passes settle the offset around DST transitions.
  let guess = wall - zoneOffsetMs(wall, timeZone);
  guess = wall - zoneOffsetMs(guess, timeZone);
  return new Date(guess).toISOString();
}

/** ISO UTC string -> "YYYY-MM-DDTHH:mm" wall clock in `timeZone`. */
export function utcToLocalInput(iso: string, timeZone: string): string {
  const p = partsInZone(Date.parse(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Human display, e.g. "Fri, Nov 13, 7:30 PM CST". */
export function formatInZone(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...opts,
  }).format(new Date(iso));
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
