'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, parseForm, type ActionState } from '@/lib/actions';
import { getManagedEvent } from '@/lib/event';
import { formImage, removeEventImage, uploadEventImage } from '@/lib/media';
import type { MediaKind } from '@/lib/media-rules';
import { checkbox, localDateTime, optionalUrl, sortOrder, uuid } from '@/lib/schemas';
import { checkOrder, wallTimesToUtc } from '@/lib/time-form';

type Ctx = Awaited<ReturnType<typeof getManagedEvent>>;

/**
 * Resolves the image column for a save: a new upload replaces the old one,
 * "remove" clears it, otherwise it is left alone (undefined).
 */
async function imageChange(
  ctx: Ctx,
  form: FormData,
  kind: MediaKind,
  current: string | null,
  remove: boolean,
): Promise<{ value?: string | null; replaced?: string | null }> {
  const file = formImage(form, 'image');
  if (file) return { value: await uploadEventImage(ctx.supabase, ctx.event.id, kind, file), replaced: current };
  if (remove) return { value: null, replaced: current };
  return {};
}

function done(eventId: string, message: string): ActionState {
  revalidatePath(`/events/${eventId}/content`);
  return ok(message);
}

// --- Lineup ----------------------------------------------------------------

const LineupSchema = z.object({
  id: uuid.optional(),
  artist: z.string().min(1).max(200),
  stage: z.string().min(1).max(100),
  starts_at: localDateTime,
  ends_at: localDateTime,
  description: z.string().max(2000).optional(),
  remove_image: checkbox,
});

export async function saveLineupItem(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getManagedEvent(eventId);
  const parsed = parseForm(LineupSchema, form);
  if (!parsed.success) return invalid(parsed);
  const { id, starts_at, ends_at, remove_image, ...rest } = parsed.data;

  const times = wallTimesToUtc({ starts_at, ends_at }, ctx.event.timezone);
  if (!times.ok) return { ok: false, message: times.message };
  const orderError = checkOrder(times.value.starts_at, times.value.ends_at);
  if (orderError) return { ok: false, message: orderError };

  const current = id
    ? (await ctx.supabase.from('lineup_items').select('image_path').eq('id', id).eq('event_id', eventId).maybeSingle()).data
    : null;
  let image;
  try {
    image = await imageChange(ctx, form, 'lineup', current?.image_path ?? null, remove_image);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const row = {
    ...rest,
    description: rest.description ?? null,
    starts_at: times.value.starts_at!,
    ends_at: times.value.ends_at!,
    ...(image.value !== undefined ? { image_path: image.value } : {}),
  };
  const { error } = id
    ? await ctx.supabase.from('lineup_items').update(row).eq('id', id).eq('event_id', eventId)
    : await ctx.supabase.from('lineup_items').insert({ ...row, event_id: eventId });
  if (error) return fail(error);
  await removeEventImage(ctx.supabase, eventId, image.replaced);
  return done(eventId, id ? 'Set saved.' : 'Set added.');
}

// --- FAQ / info / map --------------------------------------------------------

const ContentSchema = z.object({
  id: uuid.optional(),
  kind: z.enum(['faq', 'info', 'map']),
  title: z.string().min(1).max(200),
  body: z.string().max(10000).optional(),
  sort_order: sortOrder,
  remove_image: checkbox,
});

export async function saveContent(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getManagedEvent(eventId);
  const parsed = parseForm(ContentSchema, form);
  if (!parsed.success) return invalid(parsed);
  const { id, remove_image, ...rest } = parsed.data;

  const current = id
    ? (await ctx.supabase.from('event_content').select('image_path').eq('id', id).eq('event_id', eventId).maybeSingle()).data
    : null;
  let image;
  try {
    image = await imageChange(ctx, form, rest.kind === 'map' ? 'map' : 'content', current?.image_path ?? null, remove_image);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const row = {
    ...rest,
    body: rest.body ?? null,
    ...(image.value !== undefined ? { image_path: image.value } : {}),
  };
  const { error } = id
    ? await ctx.supabase.from('event_content').update(row).eq('id', id).eq('event_id', eventId)
    : await ctx.supabase.from('event_content').insert({ ...row, event_id: eventId });
  if (error) return fail(error);
  await removeEventImage(ctx.supabase, eventId, image.replaced);
  return done(eventId, 'Saved.');
}

// --- Sponsors ----------------------------------------------------------------

const SponsorSchema = z.object({
  id: uuid.optional(),
  sponsor_name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  cta_url: optionalUrl,
  sort_order: sortOrder,
  remove_image: checkbox,
});

export async function saveSponsor(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getManagedEvent(eventId);
  const parsed = parseForm(SponsorSchema, form);
  if (!parsed.success) return invalid(parsed);
  const { id, remove_image, ...rest } = parsed.data;

  const current = id
    ? (await ctx.supabase.from('sponsor_activations').select('logo_path').eq('id', id).eq('event_id', eventId).maybeSingle()).data
    : null;
  let image;
  try {
    image = await imageChange(ctx, form, 'sponsor', current?.logo_path ?? null, remove_image);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const row = {
    ...rest,
    description: rest.description ?? null,
    location: rest.location ?? null,
    cta_url: rest.cta_url ?? null,
    ...(image.value !== undefined ? { logo_path: image.value } : {}),
  };
  const { error } = id
    ? await ctx.supabase.from('sponsor_activations').update(row).eq('id', id).eq('event_id', eventId)
    : await ctx.supabase.from('sponsor_activations').insert({ ...row, event_id: eventId });
  if (error) return fail(error);
  await removeEventImage(ctx.supabase, eventId, image.replaced);
  return done(eventId, id ? 'Sponsor saved.' : 'Sponsor added.');
}

// --- Delete --------------------------------------------------------------------

const TABLES = {
  lineup: { table: 'lineup_items', image: 'image_path' },
  content: { table: 'event_content', image: 'image_path' },
  sponsor: { table: 'sponsor_activations', image: 'logo_path' },
} as const;

export async function deleteContentItem(
  eventId: string,
  type: keyof typeof TABLES,
  id: string,
  _: ActionState,
): Promise<ActionState> {
  const ctx = await getManagedEvent(eventId);
  const { table, image } = TABLES[type];
  const { data, error } = await ctx.supabase.from(table).delete().eq('id', id).eq('event_id', eventId).select(image);
  if (error) return fail(error);
  const path = (data?.[0] as Record<string, string | null> | undefined)?.[image];
  await removeEventImage(ctx.supabase, eventId, path);
  return done(eventId, 'Deleted.');
}
