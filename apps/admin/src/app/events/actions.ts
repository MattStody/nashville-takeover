'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { fail, invalid, parseForm, type ActionState } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';
import { invokeFunction } from '@/lib/functions';
import { extractLumaEventId } from '@/lib/luma-id';

const LinkSchema = z.object({
  luma: z.string().min(4, 'Enter a Luma event ID or link'),
});

export async function linkLumaEvent(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(LinkSchema, form);
  if (!parsed.success) return invalid(parsed);
  const lumaEventId = extractLumaEventId(parsed.data.luma);
  if (!lumaEventId) return { ok: false, message: 'Could not find a Luma event ID (it starts with "evt-").' };

  const { data, error } = await invokeFunction<{ event_id: string }>('luma-sync', {
    action: 'link',
    luma_event_id: lumaEventId,
  });
  if (error || !data) return fail(error);
  revalidatePath('/events');
  redirect(`/events/${data.event_id}`);
}
