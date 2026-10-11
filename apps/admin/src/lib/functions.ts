import 'server-only';
import { supabaseServer } from './supabase/server';

/**
 * Calls an edge function as the signed-in user (their JWT is forwarded and
 * the function re-checks their role). Returns the JSON body or an error code.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error) return { data: data ?? undefined };
  // FunctionsHttpError carries the response; surface our { error } code.
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const payload = (await ctx.json()) as { error?: string; message?: string };
      return { error: payload.error ?? payload.message ?? error.message };
    } catch {
      // fall through
    }
  }
  return { error: error.message };
}
