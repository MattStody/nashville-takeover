// Full backfill of Luma guests and tickets for one event, or for every linked
// event (cron). Long syncs return a run_id; call again with it to resume.
//
//   { "action": "sync", "event_id": "<uuid>", "run_id"?: "<uuid>" }  manager+
//   { "action": "link", "luma_event_id": "evt-..." }                   admin
//   { "action": "sync_all" }                                           service role (cron)
import { z } from 'zod';
import { runBackfill } from '../_shared/nt/index.ts';
import { env } from '../_shared/env.ts';
import { handler, HttpError, json, log, readJson } from '../_shared/http.ts';
import { authenticate, lumaAdapter, requireAdmin, requireEventRole, serviceClient, type Caller } from '../_shared/supabase.ts';
import { SupabaseSyncStore } from '../_shared/store.ts';

const FN = 'luma-sync';
/** A running run not touched for this long is considered abandoned. */
const STALE_RUN_MS = 5 * 60_000;

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync'), event_id: z.string().uuid(), run_id: z.string().uuid().optional() }),
  z.object({ action: z.literal('link'), luma_event_id: z.string().regex(/^evt-[A-Za-z0-9]+$/) }),
  z.object({ action: z.literal('sync_all') }),
]);

interface EventRef {
  id: string;
  luma_event_id: string;
}

async function syncEvent(caller: Caller, event: EventRef, runId: string | undefined, deadline: number) {
  const db = serviceClient();
  const trigger = caller.kind === 'service' ? 'cron' : 'manual';

  let run: { id: string; cursor: string | null; guests_upserted: number; tickets_upserted: number };
  if (runId) {
    const { data, error } = await db
      .from('luma_sync_runs')
      .select('id, event_id, status, cursor, guests_upserted, tickets_upserted')
      .eq('id', runId)
      .single();
    if (error || !data || data.event_id !== event.id) throw new HttpError(404, 'run_not_found');
    if (data.status !== 'running') return { run_id: data.id, done: true, status: data.status };
    run = data;
  } else {
    const { data: active } = await db
      .from('luma_sync_runs')
      .select('id, updated_at')
      .eq('event_id', event.id)
      .eq('status', 'running')
      .gte('updated_at', new Date(Date.now() - STALE_RUN_MS).toISOString())
      .limit(1);
    if (active && active.length > 0) throw new HttpError(409, 'sync_in_progress', active[0]!.id);

    // Abandoned runs (function killed mid-way) are closed out first.
    await db
      .from('luma_sync_runs')
      .update({ status: 'failed', error: 'abandoned', finished_at: new Date().toISOString() })
      .eq('event_id', event.id)
      .eq('status', 'running');

    const { data, error } = await db
      .from('luma_sync_runs')
      .insert({ event_id: event.id, trigger, started_by: caller.kind === 'user' ? caller.userId : null })
      .select('id, cursor, guests_upserted, tickets_upserted')
      .single();
    if (error || !data) throw new HttpError(500, 'run_create_failed', error?.message);
    run = data;
  }

  try {
    const result = await runBackfill({
      adapter: lumaAdapter(FN),
      store: new SupabaseSyncStore(db),
      event: { id: event.id, lumaEventId: event.luma_event_id },
      runId: run.id,
      cursor: run.cursor,
      totals: { guests: run.guests_upserted, tickets: run.tickets_upserted },
      deadline,
    });
    log('info', FN, result.done ? 'sync_complete' : 'sync_partial', {
      event_id: event.id,
      run_id: run.id,
      guests: result.guests,
      tickets: result.tickets,
    });
    return { run_id: run.id, done: result.done, guests: result.guests, tickets: result.tickets };
  } catch (e) {
    await db
      .from('luma_sync_runs')
      .update({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() })
      .eq('id', run.id);
    throw e;
  }
}

async function loadEvent(id: string): Promise<EventRef> {
  const { data, error } = await serviceClient().from('events').select('id, luma_event_id').eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, 'event_lookup_failed', error.message);
  if (!data) throw new HttpError(404, 'event_not_found');
  if (!data.luma_event_id) throw new HttpError(422, 'event_not_linked_to_luma');
  return data as EventRef;
}

function slugify(name: string, lumaEventId: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${base || 'event'}-${lumaEventId.slice(-6).toLowerCase()}`;
}

Deno.serve(
  handler(FN, async (req) => {
    const started = Date.now();
    const deadline = started + env().SYNC_TIME_BUDGET_MS;
    const caller = await authenticate(req);
    const body = await readJson(req, Body);

    if (body.action === 'sync') {
      await requireEventRole(caller, body.event_id, ['admin', 'manager']);
      return json(await syncEvent(caller, await loadEvent(body.event_id), body.run_id, deadline));
    }

    if (body.action === 'link') {
      await requireAdmin(caller);
      const db = serviceClient();
      const { data: existing } = await db.from('events').select('id').eq('luma_event_id', body.luma_event_id).maybeSingle();
      let eventId = existing?.id as string | undefined;
      if (!eventId) {
        const luma = await lumaAdapter(FN).getEvent(body.luma_event_id);
        if (!luma) throw new HttpError(404, 'luma_event_not_found');
        const { data, error } = await db
          .from('events')
          .insert({
            luma_event_id: luma.id,
            slug: slugify(luma.name, luma.id),
            name: luma.name,
            starts_at: luma.startAt,
            ends_at: luma.endAt,
            timezone: luma.timezone,
            status: 'draft',
          })
          .select('id')
          .single();
        if (error || !data) throw new HttpError(500, 'event_create_failed', error?.message);
        eventId = data.id as string;
        log('info', FN, 'event_linked', { event_id: eventId, luma_event_id: luma.id });
      }
      const sync = await syncEvent(caller, { id: eventId, luma_event_id: body.luma_event_id }, undefined, deadline);
      return json({ event_id: eventId, ...sync });
    }

    // sync_all: cron only. Resumes running runs first, then starts the rest.
    if (caller.kind !== 'service') throw new HttpError(403, 'forbidden');
    const db = serviceClient();
    const { data: events, error } = await db
      .from('events')
      .select('id, luma_event_id')
      .not('luma_event_id', 'is', null)
      .in('status', ['draft', 'published'])
      .gte('ends_at', new Date(Date.now() - 2 * 86_400_000).toISOString());
    if (error) throw new HttpError(500, 'event_lookup_failed', error.message);

    const results: unknown[] = [];
    for (const event of (events ?? []) as EventRef[]) {
      if (Date.now() >= deadline) {
        results.push({ event_id: event.id, skipped: 'time_budget' });
        continue;
      }
      const { data: running } = await db
        .from('luma_sync_runs')
        .select('id')
        .eq('event_id', event.id)
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1);
      try {
        results.push({ event_id: event.id, ...(await syncEvent(caller, event, running?.[0]?.id, deadline)) });
      } catch (e) {
        results.push({ event_id: event.id, error: e instanceof HttpError ? e.code : 'sync_failed' });
      }
    }
    return json({ results });
  }),
);
