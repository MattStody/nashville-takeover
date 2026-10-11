'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { fail, invalid, ok, parseForm, type ActionState } from '@/lib/actions';
import { supabaseServer } from '@/lib/supabase/server';

const Schema = z.object({ email: z.string().email('Enter a valid email') });

/**
 * Emails a sign-in link to the address entered. Only people who type their own
 * email here receive anything; the dashboard never emails guests.
 */
export async function sendSignInLink(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseForm(Schema, form);
  if (!parsed.success) return invalid(parsed);
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email.toLowerCase(),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return fail(error);
  return ok('Check your inbox for a sign-in link. It expires in an hour.');
}
