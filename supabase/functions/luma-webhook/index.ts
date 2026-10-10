// Receives Luma webhooks (guest.registered, guest.updated, ticket.registered).
//
// Luma documents a per-webhook secret but not a signing scheme, so we don't
// trust the payload on its own:
//   1. The webhook URL carries a long random token (?token=...), generated in
//      Supabase Vault and checked in constant time. Requests without it are
//      rejected.
//   2. The guest is re-fetched from the Luma API and that answer is stored;
//      the payload is only a fallback if Luma's API is unreachable.
// Deliveries are de-duplicated by a hash of the body.
import { parseLumaWebhook, safeEqual, webhookReceiptId, type LumaGuest } from '../_shared/nt/index.ts';
import { env } from '../_shared/env.ts';
import { handler, HttpError, json, log } from '../_shared/http.ts';
import { internalSecret } from '../_shared/secrets.ts';
import { lumaAdapter, serviceClient } from '../_shared/supabase.ts';

const FN = 'luma-webhook';
const MAX_BODY = 1_000_000;

Deno.serve(
  handler(FN, async (req) => {
    // An explicit LUMA_WEBHOOK_TOKEN secret wins; otherwise the Vault-held token
    // that luma-sync's register_webhook action put in the URL.
    const expected = env().LUMA_WEBHOOK_TOKEN ?? (await internalSecret(serviceClient(), 'luma_webhook_token'));
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!safeEqual(token, expected)) throw new HttpError(401, 'invalid_token');

    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new HttpError(413, 'payload_too_large');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'invalid_json');
    }

    let parsed: ReturnType<typeof parseLumaWebhook>;
    try {
      parsed = parseLumaWebhook(body);
    } catch (e) {
      log('error', FN, 'unparseable_webhook', { message: (e as Error).message.slice(0, 300) });
      throw new HttpError(400, 'invalid_payload');
    }
    if (parsed.kind === 'ignored') return json({ ok: true, ignored: parsed.type });

    const db = serviceClient();
    const receiptId = await webhookReceiptId(raw);
    const { data: receipt, error: receiptError } = await db
      .from('luma_webhook_receipts')
      .upsert(
        { delivery_id: receiptId, event_type: parsed.type, luma_event_id: parsed.lumaEventId },
        { onConflict: 'delivery_id', ignoreDuplicates: true },
      )
      .select('delivery_id');
    if (receiptError) throw new HttpError(500, 'receipt_failed', receiptError.message);
    if (!receipt || receipt.length === 0) return json({ ok: true, duplicate: true });

    try {
      const { data: event } = await db
        .from('events')
        .select('id')
        .eq('luma_event_id', parsed.lumaEventId)
        .maybeSingle();
      if (!event) {
        log('info', FN, 'unknown_event', { luma_event_id: parsed.lumaEventId, type: parsed.type });
        return json({ ok: true, ignored: 'unknown_event' });
      }

      let guest: LumaGuest = parsed.guest;
      let source = 'payload';
      try {
        const fresh = await lumaAdapter(FN).getGuest(parsed.lumaEventId, parsed.guest.id);
        if (fresh) {
          guest = fresh;
          source = 'api';
        }
      } catch (e) {
        log('warn', FN, 'refetch_failed_using_payload', { message: (e as Error).message.slice(0, 200) });
      }

      const { error } = await db.rpc('luma_upsert_guests', { p_event_id: event.id, p_guests: [guest] });
      if (error) throw new HttpError(500, 'upsert_failed', error.message);
      log('info', FN, 'guest_synced', { type: parsed.type, event_id: event.id, source, tickets: guest.tickets.length });
      return json({ ok: true });
    } catch (e) {
      // Let Luma's retry reprocess this delivery.
      await db.from('luma_webhook_receipts').delete().eq('delivery_id', receiptId);
      throw e;
    }
  }),
);
