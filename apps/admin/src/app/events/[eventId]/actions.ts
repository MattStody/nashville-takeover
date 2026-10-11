'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isValidTimeZone } from '@nt/shared';
import { fail, invalid, ok, parseForm, type ActionState } from '@/lib/actions';
import { getManagedEvent } from '@/lib/event';
import { invokeFunction } from '@/lib/functions';
import { formImage, removeEventImage, uploadEventImage } from '@/lib/media';
import { checkbox, hexColor, localDateTime, slug } from '@/lib/schemas';
import { checkOrder, wallTimesToUtc } from '@/lib/time-form';

const DetailsSchema = z.object({
  name: z.string().min(2).max(200),
  slug,
  status: z.enum(['draft', 'published', 'archived']),
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone (use e.g. America/Chicago)'),
  starts_at: localDateTime,
  ends_at: localDateTime,
  venue_name: z.string().max(200).optional(),
  venue_address: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
});

export async function updateEventDetails(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await getManagedEvent(eventId);
  const parsed = parseForm(DetailsSchema, form);
  if (!parsed.success) return invalid(parsed);
  const d = parsed.data;

  const times = wallTimesToUtc({ starts_at: d.starts_at, ends_at: d.ends_at }, d.timezone);
  if (!times.ok) return { ok: false, message: times.message };
  const orderError = checkOrder(times.value.starts_at, times.value.ends_at);
  if (orderError) return { ok: false, message: orderError };

  const { error } = await supabase
    .from('events')
    .update({
      name: d.name,
      slug: d.slug,
      status: d.status,
      timezone: d.timezone,
      starts_at: times.value.starts_at!,
      ends_at: times.value.ends_at!,
      venue_name: d.venue_name ?? null,
      venue_address: d.venue_address ?? null,
      description: d.description ?? null,
    })
    .eq('id', eventId);
  if (error) return fail(error);
  revalidatePath(`/events/${eventId}`, 'layout');
  return ok('Saved.');
}

const BrandingSchema = z.object({
  primary_color: hexColor.optional(),
  accent_color: hexColor.optional(),
  remove_hero: checkbox,
  remove_logo: checkbox,
});

export async function updateBranding(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, event } = await getManagedEvent(eventId);
  const parsed = parseForm(BrandingSchema, form);
  if (!parsed.success) return invalid(parsed);
  const d = parsed.data;

  const patch: { primary_color: string | null; accent_color: string | null; hero_image_path?: string | null; logo_path?: string | null } = {
    primary_color: d.primary_color ?? null,
    accent_color: d.accent_color ?? null,
  };
  const replaced: (string | null)[] = [];
  try {
    const hero = formImage(form, 'hero');
    if (hero) {
      patch.hero_image_path = await uploadEventImage(supabase, eventId, 'hero', hero);
      replaced.push(event.hero_image_path);
    } else if (d.remove_hero) {
      patch.hero_image_path = null;
      replaced.push(event.hero_image_path);
    }
    const logo = formImage(form, 'logo');
    if (logo) {
      patch.logo_path = await uploadEventImage(supabase, eventId, 'logo', logo);
      replaced.push(event.logo_path);
    } else if (d.remove_logo) {
      patch.logo_path = null;
      replaced.push(event.logo_path);
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const { error } = await supabase.from('events').update(patch).eq('id', eventId);
  if (error) return fail(error);
  await Promise.all(replaced.map((p) => removeEventImage(supabase, eventId, p)));
  revalidatePath(`/events/${eventId}`, 'layout');
  return ok('Branding saved.');
}

export type SyncStep = { ok: true; done: boolean; runId: string; guests: number; tickets: number } | { ok: false; message: string };

/** One sync step. The client calls again with the run id until done. */
export async function syncStep(eventId: string, runId?: string): Promise<SyncStep> {
  await getManagedEvent(eventId);
  const { data, error } = await invokeFunction<{ run_id: string; done: boolean; guests?: number; tickets?: number; status?: string }>(
    'luma-sync',
    { action: 'sync', event_id: eventId, ...(runId ? { run_id: runId } : {}) },
  );
  if (error || !data) return { ok: false, message: fail(error)!.message };
  if (data.status === 'failed') return { ok: false, message: 'The sync failed. See the sync history below.' };
  if (data.done) revalidatePath(`/events/${eventId}`, 'layout');
  return { ok: true, done: data.done, runId: data.run_id, guests: data.guests ?? 0, tickets: data.tickets ?? 0 };
}
