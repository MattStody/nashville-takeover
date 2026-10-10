import { z } from 'zod';
import { LumaApiError, LumaContractError } from './nt/index.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

/** One structured log line per event; never pass secrets or guest PII here. */
export function log(level: 'info' | 'warn' | 'error', fn: string, msg: string, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ level, fn, msg, ...fields }));
}

export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = 64_000): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large');
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return parsed.data;
}

/** Wraps a handler with CORS, method check and error mapping. */
export function handler(fn: string, impl: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      return await impl(req);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status >= 500) log('error', fn, e.message, { code: e.code });
        return json({ error: e.code, message: e.message === e.code ? undefined : e.message }, e.status);
      }
      if (e instanceof LumaApiError) {
        log('error', fn, 'luma_api_error', { status: e.status, retryable: e.retryable, message: e.message });
        return json({ error: e.status === 429 ? 'luma_rate_limited' : 'luma_unavailable' }, e.status === 429 ? 503 : 502);
      }
      if (e instanceof LumaContractError) {
        log('error', fn, 'luma_contract_error', { message: e.message });
        return json({ error: 'luma_unexpected_response' }, 502);
      }
      log('error', fn, 'unhandled', { message: (e as Error).message });
      return json({ error: 'internal_error' }, 500);
    }
  };
}
