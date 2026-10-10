import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createLumaAdapter, type LumaAdapter } from './nt/index.ts';
import { env } from './env.ts';
import { HttpError, log } from './http.ts';

export function serviceClient(): SupabaseClient {
  const e = env();
  return createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Caller =
  | { kind: 'service' }
  | { kind: 'user'; userId: string; client: SupabaseClient };

/**
 * Identifies the caller from the Authorization header: the service role key
 * (cron, internal) or a signed-in user's JWT (dashboard, staff app).
 */
export async function authenticate(req: Request): Promise<Caller> {
  const e = env();
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'missing_authorization');
  if (token === e.SUPABASE_SERVICE_ROLE_KEY) return { kind: 'service' };

  const client = createClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'invalid_token');
  return { kind: 'user', userId: data.user.id, client };
}

/** Throws 403 unless the caller holds one of the roles for the event. */
export async function requireEventRole(
  caller: Caller,
  eventId: string,
  roles: ('admin' | 'manager' | 'staff')[],
): Promise<void> {
  if (caller.kind === 'service') return;
  const { data, error } = await caller.client.rpc('my_event_role', { p_event_id: eventId });
  if (error) throw new HttpError(500, 'role_check_failed', error.message);
  if (!roles.includes(data as 'admin')) throw new HttpError(403, 'forbidden');
}

export async function requireAdmin(caller: Caller): Promise<void> {
  if (caller.kind === 'service') return;
  const { data, error } = await caller.client.from('profiles').select('is_admin').eq('id', caller.userId).single();
  if (error || !data?.is_admin) throw new HttpError(403, 'forbidden');
}

export function lumaAdapter(fn: string): LumaAdapter {
  const e = env();
  return createLumaAdapter(e, {
    onWait: (ms, reason) => log('warn', fn, 'luma_backoff', { ms, reason }),
  });
}
