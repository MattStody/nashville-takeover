import { z } from 'zod';

const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/** Public config only. The dashboard never holds a Supabase secret key. */
export function publicEnv() {
  const parsed = PublicEnv.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)');
  }
  return parsed.data;
}

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-media/${path}`;
}
