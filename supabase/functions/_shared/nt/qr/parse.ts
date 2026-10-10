// GENERATED from packages/shared/src by `pnpm functions:vendor`. Do not edit.
// Parses Luma check-in QR codes:
//   https://luma.com/check-in/<event-id>?pk=<key>
// <key> is a guest key ("g-...", covers every ticket on the registration) or a
// ticket key (one ticket). Pure and synchronous so the offline scanner can use it.

const LUMA_HOSTS = new Set(['luma.com', 'www.luma.com', 'lu.ma', 'www.lu.ma']);
const EVENT_ID = /^evt-[A-Za-z0-9]+$/;
const KEY = /^[A-Za-z0-9_-]{4,128}$/;

export type CheckInKeyKind = 'guest' | 'ticket';

export interface ParsedCheckInQr {
  /** Luma event id, e.g. "evt-sjZpNrnBWMYQFwm". */
  lumaEventId: string;
  key: string;
  kind: CheckInKeyKind;
}

export type QrParseError =
  | 'empty'
  | 'not_a_url'
  | 'not_luma'
  | 'not_check_in'
  | 'bad_event_id'
  | 'missing_key'
  | 'bad_key';

export type QrParseResult = { ok: true; value: ParsedCheckInQr } | { ok: false; error: QrParseError };

export function keyKind(key: string): CheckInKeyKind {
  return key.startsWith('g-') ? 'guest' : 'ticket';
}

export function parseCheckInQr(raw: string): QrParseResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'empty' };

  let url: URL;
  try {
    // Some scanners drop the scheme.
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: 'not_a_url' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'not_a_url' };
  if (!LUMA_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, error: 'not_luma' };

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'check-in') return { ok: false, error: 'not_check_in' };
  const lumaEventId = segments[1]!;
  if (!EVENT_ID.test(lumaEventId)) return { ok: false, error: 'bad_event_id' };

  const key = url.searchParams.get('pk')?.trim();
  if (!key) return { ok: false, error: 'missing_key' };
  if (!KEY.test(key)) return { ok: false, error: 'bad_key' };

  return { ok: true, value: { lumaEventId, key, kind: keyKind(key) } };
}

/** Builds the QR payload for a key, e.g. to render a guest's own QR in the app. */
export function buildCheckInQr(lumaEventId: string, key: string): string {
  return `https://luma.com/check-in/${encodeURIComponent(lumaEventId)}?pk=${encodeURIComponent(key)}`;
}

/**
 * Explains a scan result for the staff UI. A code for a different event is the
 * most common failure at a multi-event festival, so it is called out.
 */
export function describeQrForEvent(
  result: QrParseResult,
  expectedLumaEventId: string,
): { ok: true; value: ParsedCheckInQr } | { ok: false; error: QrParseError | 'wrong_event' } {
  if (!result.ok) return result;
  if (result.value.lumaEventId !== expectedLumaEventId) return { ok: false, error: 'wrong_event' };
  return result;
}
