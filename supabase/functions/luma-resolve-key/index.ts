// Resolves a QR key the device could not match locally (usually a ticket key,
// which Luma's API never lists) by asking Luma, then syncs that guest and
// remembers the key so later scans resolve offline.
//
//   { "event_id": "<uuid>", "key": "<pk from the QR>" }   staff+
import { z } from 'zod';
import { keyKind } from '../_shared/nt/index.ts';
import { handler, HttpError, json, log, readJson } from '../_shared/http.ts';
import { authenticate, lumaAdapter, requireEventRole, serviceClient } from '../_shared/supabase.ts';

const FN = 'luma-resolve-key';

const Body = z.object({
  event_id: z.string().uuid(),
  key: z.string().regex(/^[A-Za-z0-9_-]{4,128}$/),
});

Deno.serve(
  handler(FN, async (req) => {
    const caller = await authenticate(req);
    const body = await readJson(req, Body);
    await requireEventRole(caller, body.event_id, ['admin', 'manager', 'staff']);

    const db = serviceClient();
    const { data: event, error } = await db.from('events').select('id, luma_event_id').eq('id', body.event_id).maybeSingle();
    if (error) throw new HttpError(500, 'event_lookup_failed', error.message);
    if (!event?.luma_event_id) throw new HttpError(404, 'event_not_found');

    const guest = await lumaAdapter(FN).getGuest(event.luma_event_id, body.key);
    if (!guest) return json({ error: 'unknown_key' }, 404);

    const { error: upsertError } = await db.rpc('luma_upsert_guests', { p_event_id: event.id, p_guests: [guest] });
    if (upsertError) throw new HttpError(500, 'upsert_failed', upsertError.message);

    if (keyKind(body.key) === 'ticket' && body.key !== guest.guestKey) {
      // With one ticket the key must be that ticket; otherwise we only know the guest.
      const only = guest.tickets.length === 1 ? guest.tickets[0]!.id : null;
      const { error: aliasError } = await db.rpc('luma_record_key_alias', {
        p_event_id: event.id,
        p_key: body.key,
        p_luma_guest_id: guest.id,
        p_luma_ticket_id: only,
      });
      if (aliasError) throw new HttpError(500, 'alias_failed', aliasError.message);
    }

    // Resolve as the caller where possible so RLS-backed checks apply to them.
    const reader = caller.kind === 'user' ? caller.client : db;
    const { data: tickets, error: resolveError } = await reader.rpc('resolve_check_in_key', {
      p_event_id: event.id,
      p_key: body.key,
    });
    if (resolveError) throw new HttpError(500, 'resolve_failed', resolveError.message);
    log('info', FN, 'key_resolved', { event_id: event.id, tickets: (tickets ?? []).length });
    return json({ tickets });
  }),
);
