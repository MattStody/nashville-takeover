import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LUMA_MODE: z.enum(['mock', 'live']).default('mock'),
  LUMA_API_KEY: z.string().min(1).optional(),
  /** Shared secret in the webhook URL (?token=...). Required for luma-webhook. */
  LUMA_WEBHOOK_TOKEN: z.string().min(32).optional(),
  /** How long one luma-sync call may run before handing back a resumable run. */
  SYNC_TIME_BUDGET_MS: z.coerce.number().int().min(5_000).max(140_000).default(100_000),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated env. Throws (500) on misconfiguration, never echoing values. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(Deno.env.toObject());
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid edge function configuration: ${fields}`);
  }
  if (parsed.data.LUMA_MODE === 'live' && !parsed.data.LUMA_API_KEY) {
    throw new Error('Invalid edge function configuration: LUMA_API_KEY is required when LUMA_MODE=live');
  }
  cached = parsed.data;
  return cached;
}
