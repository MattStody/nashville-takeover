// Read-only check of the live Luma API against a real event. Prints shapes
// and counts only: no names, emails or keys. Usage:
//   LUMA_API_KEY=... pnpm --filter @nt/shared luma:smoke evt-XXXX
import { LiveLumaAdapter, parseCheckInQr } from '../src/index.ts';
import { LumaHttp } from '../src/luma/live/http.ts';
import { RawGuestListSchema } from '../src/luma/live/raw.ts';

const eventId = process.argv[2];
if (!eventId?.startsWith('evt-')) throw new Error('Pass a Luma event id (evt-...)');
const apiKey = process.env.LUMA_API_KEY;
if (!apiKey) throw new Error('Set LUMA_API_KEY');

const mask = (s: string) => (s.length <= 6 ? '***' : `${s.slice(0, 4)}…(${s.length})`);
const adapter = new LiveLumaAdapter({ apiKey });

const event = await adapter.getEvent(eventId);
console.log('event:', event ? { found: true, timezone: event.timezone, startAt: event.startAt } : { found: false });

const types = await adapter.listTicketTypes(eventId);
console.log('ticket types:', types.length, types.map((t) => ({ id: mask(t.id), hidden: t.isHidden })));

// Raw first page, to see the QR format and ticket id shape as Luma sends them.
const raw = await new LumaHttp({ apiKey }).get(
  '/v1/events/guests/list',
  { event_id: eventId, pagination_limit: 10 },
  RawGuestListSchema,
);
for (const g of raw?.entries ?? []) {
  const qr = parseCheckInQr(g.check_in_qr_code);
  console.log('guest:', {
    idPrefix: g.id.split('-')[0],
    approval: g.approval_status,
    qr: qr.ok ? { kind: qr.value.kind, sameEvent: qr.value.lumaEventId === eventId } : { error: qr.error, sample: mask(g.check_in_qr_code) },
    tickets: g.event_tickets.map((t) => ({ idPrefix: t.id.split('-')[0], idLength: t.id.length })),
  });
}

let total = 0;
let cursor: string | null = null;
do {
  const page = await adapter.listGuests(eventId, { cursor });
  total += page.entries.length;
  cursor = page.nextCursor;
} while (cursor);
console.log('all guests normalised OK:', total);
