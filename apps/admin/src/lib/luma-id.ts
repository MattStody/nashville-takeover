import { parseCheckInQr } from '@nt/shared';

/** Accepts "evt-…", a luma.com/event/manage/evt-… link, or a check-in QR link. */
export function extractLumaEventId(input: string): string | null {
  const direct = /\b(evt-[A-Za-z0-9]+)\b/.exec(input);
  if (direct) return direct[1]!;
  const qr = parseCheckInQr(input);
  return qr.ok ? qr.value.lumaEventId : null;
}
