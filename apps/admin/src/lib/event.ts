import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { requireEventManager } from './auth';
import { supabaseServer } from './supabase/server';

/** The event, after checking the viewer manages it (404 otherwise). */
export const getManagedEvent = cache(async (eventId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const viewer = await requireEventManager(eventId);
  const supabase = await supabaseServer();
  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (!event) notFound();
  return { viewer, event, supabase };
});
