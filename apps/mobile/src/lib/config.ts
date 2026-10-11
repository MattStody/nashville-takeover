// Public values only: the publishable key is safe in an app (RLS protects
// data). Env vars override them for other projects.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xmwyrppnznisdhmervye.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_3FVlsRU4_8AS6XYTngZJ-Q_rSYWQq1-';

export function mediaUrl(path: string | null | undefined): string | null {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/event-media/${path}` : null;
}
