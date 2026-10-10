import { z } from 'zod';

// Supabase provides both the new keys (SUPABASE_PUBLISHABLE_KEYS /
// SUPABASE_SECRET_KEYS, JSON maps by key name) and, until the end of 2026, the
// legacy JWT keys (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY). We prefer the
// new keys and fall back to the legacy ones.
const KeyMap = z
  .string()
  .transform((s, ctx) => {
    try {
      return z.record(z.string()).parse(JSON.parse(s));
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be a JSON object of key names to keys' });
      return z.NEVER;
    }
  })
  .optional();

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEYS: KeyMap,
  SUPABASE_SECRET_KEYS: KeyMap,
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  LUMA_MODE: z.enum(['mock', 'live']).default('mock'),
  LUMA_API_KEY: z.string().min(1).optional(),
  /** Shared secret in the webhook URL (?token=...). Required for luma-webhook. */
  LUMA_WEBHOOK_TOKEN: z.string().min(32).optional(),
  /** How long one luma-sync call may run before handing back a resumable run. */
  SYNC_TIME_BUDGET_MS: z.coerce.number().int().min(5_000).max(140_000).default(100_000),
});

export type Env = z.infer<typeof EnvSchema> & {
  /** Key for user-scoped clients (RLS applies). */
  publishableKey: string;
  /** Key for the admin client (bypasses RLS). */
  secretKey: string;
  /** Every key that identifies a backend caller (cron, internal). */
  serviceKeys: string[];
};

let cached: Env | undefined;

/** Validated env. Throws (500) on misconfiguration, never echoing values. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(Deno.env.toObject());
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid edge function configuration: ${fields}`);
  }
  const e = parsed.data;
  if (e.LUMA_MODE === 'live' && !e.LUMA_API_KEY) {
    throw new Error('Invalid edge function configuration: LUMA_API_KEY is required when LUMA_MODE=live');
  }
  const publishableKey = e.SUPABASE_PUBLISHABLE_KEYS?.default ?? e.SUPABASE_ANON_KEY;
  const secretKey = e.SUPABASE_SECRET_KEYS?.default ?? e.SUPABASE_SERVICE_ROLE_KEY;
  if (!publishableKey || !secretKey) {
    throw new Error('Invalid edge function configuration: no Supabase API keys in the environment');
  }
  const serviceKeys = [...Object.values(e.SUPABASE_SECRET_KEYS ?? {}), e.SUPABASE_SERVICE_ROLE_KEY].filter(
    (k): k is string => !!k,
  );
  cached = { ...e, publishableKey, secretKey, serviceKeys };
  return cached;
}
