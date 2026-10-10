import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

export type InternalSecretName = 'luma_webhook_token' | 'internal_cron_token';

const cache = new Map<InternalSecretName, string>();

/**
 * Reads (creating on first use) a secret kept in Supabase Vault. See the
 * internal_secret() migration. Cached for the life of the isolate.
 */
export async function internalSecret(db: SupabaseClient, name: InternalSecretName): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const { data, error } = await db.rpc('internal_secret', { p_name: name });
  if (error || typeof data !== 'string' || data.length < 32) {
    throw new HttpError(500, 'internal_secret_unavailable', error?.message);
  }
  cache.set(name, data);
  return data;
}
