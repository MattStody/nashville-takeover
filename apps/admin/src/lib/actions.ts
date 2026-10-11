import { z } from 'zod';
import { friendlyError } from './errors';

/** What every server action returns to its form. */
export type ActionState = { ok: boolean; message: string } | null;

export const ok = (message: string): ActionState => ({ ok: true, message });
export const fail = (error: unknown): ActionState => ({ ok: false, message: friendlyError(error) });

/** Parses FormData with zod; empty strings become undefined. */
export function parseForm<S extends z.ZodTypeAny>(schema: S, form: FormData): z.SafeParseReturnType<unknown, z.infer<S>> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') raw[key] = value.trim() === '' ? undefined : value.trim();
    else if (value.size > 0) raw[key] = value;
  }
  return schema.safeParse(raw);
}

export function invalid(result: z.SafeParseError<unknown>): ActionState {
  const first = result.error.issues[0];
  return { ok: false, message: first ? `${first.path.join('.') || 'Form'}: ${first.message}` : 'Invalid form' };
}
