'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, parseForm, type ActionState } from '@/lib/actions';
import { getManagedEvent } from '@/lib/event';
import { checkbox, sortOrder, uuid } from '@/lib/schemas';

const TicketTypeSchema = z.object({
  id: uuid,
  admits_entry: checkbox,
  is_hidden: checkbox,
  sort_order: sortOrder,
});

/** Names come from Luma; managers only set entry, visibility and order. */
export async function updateTicketType(eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await getManagedEvent(eventId);
  const parsed = parseForm(TicketTypeSchema, form);
  if (!parsed.success) return invalid(parsed);
  const { id, ...patch } = parsed.data;
  const { error } = await supabase.from('ticket_types').update(patch).eq('id', id).eq('event_id', eventId);
  if (error) return fail(error);
  revalidatePath(`/events/${eventId}`, 'layout');
  return ok('Saved.');
}
