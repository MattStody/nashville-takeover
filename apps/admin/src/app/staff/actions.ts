'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, invalid, ok, parseForm, type ActionState } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';
import { email } from '@/lib/schemas';
import { parseAccess } from '@/lib/staff';
import { supabaseServer } from '@/lib/supabase/server';

const InviteSchema = z.object({
  email,
  // "admin" or "<eventId>:<role>"
  access: z.string().min(1, 'Choose what they can access'),
});

/**
 * Records an invite. It takes effect the first time that email signs in to
 * the dashboard or app (immediately if they already have an account).
 * Nothing is emailed: share the dashboard link with them yourself.
 */
export async function inviteStaff(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireAdmin();
  const parsed = parseForm(InviteSchema, form);
  if (!parsed.success) return invalid(parsed);
  const access = parseAccess(parsed.data.access);
  if (!access) return { ok: false, message: 'Choose what they can access.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.from('staff_invites').insert({
    email: parsed.data.email,
    invited_by: viewer.userId,
    ...(access.make_admin ? { make_admin: true } : { event_id: access.event_id, role: access.role }),
  });
  if (error) return fail(error);
  revalidatePath('/staff');
  return ok(`Invite saved for ${parsed.data.email}. It applies when they sign in.`);
}

export async function revokeInvite(inviteId: string, _: ActionState): Promise<ActionState> {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { error } = await supabase.from('staff_invites').delete().eq('id', inviteId).is('accepted_at', null);
  if (error) return fail(error);
  revalidatePath('/staff');
  return ok('Invite revoked.');
}

const RoleSchema = z.object({ role: z.enum(['staff', 'manager', 'remove']) });

export async function setAssignment(userId: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(RoleSchema, form);
  if (!parsed.success) return invalid(parsed);
  const supabase = await supabaseServer();
  const { error } =
    parsed.data.role === 'remove'
      ? await supabase.from('staff_assignments').delete().eq('user_id', userId).eq('event_id', eventId)
      : await supabase.from('staff_assignments').update({ role: parsed.data.role }).eq('user_id', userId).eq('event_id', eventId);
  if (error) return fail(error);
  revalidatePath('/staff');
  return ok(parsed.data.role === 'remove' ? 'Removed from event.' : 'Role updated.');
}

export async function setAdmin(userId: string, makeAdmin: boolean, _: ActionState): Promise<ActionState> {
  const viewer = await requireAdmin();
  if (!makeAdmin && userId === viewer.userId) {
    return { ok: false, message: "You can't remove your own admin rights." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.from('profiles').update({ is_admin: makeAdmin }).eq('id', userId);
  if (error) return fail(error);
  revalidatePath('/staff');
  return ok(makeAdmin ? 'Now an admin.' : 'Admin rights removed.');
}
