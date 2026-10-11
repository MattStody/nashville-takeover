import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@nt/shared';
import { isEventMediaPath, mediaPath, validateImage, type MediaKind } from './media-rules';

type Client = SupabaseClient<Database>;

/** Optional image field from a form: a non-empty File, or null. */
export function formImage(form: FormData, name: string): File | null {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

/**
 * Uploads an image as the signed-in user (storage RLS checks they manage the
 * event). Returns the stored path. Throws a readable message on failure.
 */
export async function uploadEventImage(supabase: Client, eventId: string, kind: MediaKind, file: File): Promise<string> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);
  const path = mediaPath(eventId, kind, file.type, crypto.randomUUID());
  const { error } = await supabase.storage.from('event-media').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Best-effort delete of a replaced image; never fails the surrounding action. */
export async function removeEventImage(supabase: Client, eventId: string, path: string | null | undefined) {
  if (!path || !isEventMediaPath(eventId, path)) return;
  await supabase.storage.from('event-media').remove([path]);
}
