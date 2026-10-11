'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, parseForm, type ActionState } from '@/lib/actions';
import { getManagedEvent } from '@/lib/event';
import { localDateTime, sortOrder, uuid } from '@/lib/schemas';
import { checkOrder, wallTimesToUtc } from '@/lib/time-form';

const PerkSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  icon: z.string().max(40).optional(),
  valid_from: localDateTime.optional(),
  valid_until: localDateTime.optional(),
  sort_order: sortOrder,
});

export async function savePerk(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, event } = await getManagedEvent(eventId);
  const parsed = parseForm(PerkSchema, form);
  if (!parsed.success) return invalid(parsed);
  const { id, valid_from, valid_until, ...rest } = parsed.data;

  const times = wallTimesToUtc({ valid_from, valid_until }, event.timezone);
  if (!times.ok) return { ok: false, message: times.message };
  const orderError = checkOrder(times.value.valid_from, times.value.valid_until, 'Valid until');
  if (orderError) return { ok: false, message: orderError };

  const row = {
    ...rest,
    description: rest.description ?? null,
    icon: rest.icon ?? null,
    valid_from: times.value.valid_from,
    valid_until: times.value.valid_until,
  };
  const { error } = id
    ? await supabase.from('perks').update(row).eq('id', id).eq('event_id', eventId)
    : await supabase.from('perks').insert({ ...row, event_id: eventId });
  if (error) return fail(error);
  revalidatePath(`/events/${eventId}/perks`);
  return ok(id ? 'Perk saved.' : 'Perk added.');
}

export async function deletePerk(eventId: string, perkId: string, _: ActionState): Promise<ActionState> {
  const { supabase } = await getManagedEvent(eventId);
  // Deleting a perk would cascade away its redemption ledger; refuse once used.
  const { count } = await supabase
    .from('perk_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('perk_id', perkId);
  if ((count ?? 0) > 0) {
    return { ok: false, message: 'This perk has redemptions, so it cannot be deleted. Remove it from ticket types instead.' };
  }
  const { error } = await supabase.from('perks').delete().eq('id', perkId).eq('event_id', eventId);
  if (error) return fail(error);
  revalidatePath(`/events/${eventId}/perks`);
  return ok('Perk deleted.');
}

/** Form fields "qty:<perkId>" -> quantity (0 or blank = not included). */
export async function saveTicketTypePerks(
  eventId: string,
  ticketTypeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await getManagedEvent(eventId);
  const upserts: { ticket_type_id: string; perk_id: string; event_id: string; quantity: number }[] = [];
  const removals: string[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('qty:') || typeof value !== 'string') continue;
    const perkId = key.slice(4);
    if (!uuid.safeParse(perkId).success) continue;
    const quantity = value.trim() === '' ? 0 : Number(value);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) {
      return { ok: false, message: 'Quantities must be whole numbers from 0 to 1000.' };
    }
    if (quantity === 0) removals.push(perkId);
    else upserts.push({ ticket_type_id: ticketTypeId, perk_id: perkId, event_id: eventId, quantity });
  }

  if (upserts.length > 0) {
    const { error } = await supabase.from('ticket_type_perks').upsert(upserts, { onConflict: 'ticket_type_id,perk_id' });
    if (error) return fail(error);
  }
  if (removals.length > 0) {
    const { error } = await supabase
      .from('ticket_type_perks')
      .delete()
      .eq('ticket_type_id', ticketTypeId)
      .in('perk_id', removals);
    if (error) return fail(error);
  }
  revalidatePath(`/events/${eventId}/perks`);
  return ok('Saved.');
}
