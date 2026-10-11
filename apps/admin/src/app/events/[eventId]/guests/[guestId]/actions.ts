'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, parseForm, type ActionState } from '@/lib/actions';
import { getManagedEvent } from '@/lib/event';
import { reason, uuid } from '@/lib/schemas';

function refresh(eventId: string, guestId: string) {
  revalidatePath(`/events/${eventId}/guests/${guestId}`);
  revalidatePath(`/events/${eventId}/guests`);
}

/** Manual check-in from the dashboard. Each click is a new op. */
export async function checkInTicket(eventId: string, guestId: string, ticketId: string, _: ActionState): Promise<ActionState> {
  const { supabase } = await getManagedEvent(eventId);
  const { data, error } = await supabase.rpc('record_check_in', {
    p_op_id: crypto.randomUUID(),
    p_ticket_id: ticketId,
    p_source: 'manual',
    p_device_id: 'dashboard',
  });
  if (error) return fail(error);
  refresh(eventId, guestId);
  const result = data as { is_effective?: boolean; checked_in_by_name?: string | null } | null;
  return result?.is_effective
    ? ok('Checked in.')
    : ok(`Already checked in${result?.checked_in_by_name ? ` by ${result.checked_in_by_name}` : ''}; this was logged as a repeat scan.`);
}

const UndoSchema = z.object({ check_in_id: uuid, reason });

export async function undoCheckIn(eventId: string, guestId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await getManagedEvent(eventId);
  const parsed = parseForm(UndoSchema, form);
  if (!parsed.success) return invalid(parsed);
  const { error } = await supabase.rpc('undo_check_in', {
    p_check_in_id: parsed.data.check_in_id,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error);
  refresh(eventId, guestId);
  return ok('Check-in undone.');
}

const AdjustSchema = z.object({
  ticket_id: uuid,
  perk_id: uuid,
  direction: z.enum(['use', 'return']),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100),
  reason,
});

/** "use" consumes balance, "return" gives it back. Always audited with a reason. */
export async function adjustPerk(eventId: string, guestId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await getManagedEvent(eventId);
  const parsed = parseForm(AdjustSchema, form);
  if (!parsed.success) return invalid(parsed);
  const d = parsed.data;
  const { error } = await supabase.rpc('adjust_perk', {
    p_op_id: crypto.randomUUID(),
    p_ticket_id: d.ticket_id,
    p_perk_id: d.perk_id,
    p_quantity: d.direction === 'use' ? d.quantity : -d.quantity,
    p_reason: d.reason,
  });
  if (error) return fail(error);
  refresh(eventId, guestId);
  return ok('Perk balance adjusted.');
}
