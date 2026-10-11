import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@nt/shared';
import { cookies } from 'next/headers';
import { publicEnv } from '../env';

/**
 * Supabase client acting as the signed-in user. Every query is subject to
 * RLS; the dashboard has no elevated access.
 */
export async function supabaseServer() {
  const env = publicEnv();
  const store = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the middleware refreshes cookies instead.
        }
      },
    },
  });
}
