import type { z } from 'zod';

export const LUMA_BASE_URL = 'https://public-api.luma.com';

export interface LumaHttpOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Retries for 429, 5xx and network errors. */
  maxRetries?: number;
  timeoutMs?: number;
  /** Longest single wait for a 429 before giving up (Luma blocks for ~60s). */
  maxRetryAfterMs?: number;
  /** Called before any wait, so callers with a deadline can bail out. */
  onWait?: (ms: number, reason: 'rate_limit' | 'server_error' | 'network') => void;
}

/** A Luma response we could not use. Never contains the API key. */
export class LumaApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LumaApiError';
  }
}

/** Luma answered 2xx but the body did not match the documented shape. */
export class LumaContractError extends Error {
  constructor(path: string, issues: string) {
    super(`Unexpected Luma response from ${path}: ${issues}`);
    this.name = 'LumaContractError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseReset(value: string | null, now: number): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n)) {
    // Seconds-since-epoch, milliseconds-since-epoch, or seconds-from-now.
    if (n > 1e12) return n;
    if (n > 1e9) return n * 1000;
    return now + n * 1000;
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Minimal Luma HTTP client: auth header, timeouts, and rate-limit handling per
 * https://docs.luma.com/reference/rate-limits (honour Retry-After on 429, pace
 * on X-RateLimit-Remaining / X-RateLimit-Reset).
 */
export class LumaHttp {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly maxRetryAfterMs: number;
  /** Earliest time the next request may go out (set when the window is spent). */
  private notBefore = 0;

  constructor(private readonly opts: LumaHttpOptions) {
    if (!opts.apiKey) throw new Error('Luma API key is required');
    this.baseUrl = (opts.baseUrl ?? LUMA_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetryAfterMs = opts.maxRetryAfterMs ?? 65_000;
  }

  /** GET a JSON endpoint. Returns null on 404 when allowNotFound is set. */
  async get<S extends z.ZodTypeAny>(
    path: string,
    params: Record<string, string | number | undefined | null>,
    schema: S,
    { allowNotFound = false } = {},
  ): Promise<z.infer<S> | null> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      await this.waitForWindow();

      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: 'GET',
          headers: { 'x-luma-api-key': this.opts.apiKey, accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        if (attempt >= this.maxRetries) {
          throw new LumaApiError(`Network error calling Luma ${path}: ${(e as Error).message}`, null, true);
        }
        await this.wait(this.backoff(attempt), 'network');
        continue;
      }

      this.trackWindow(res);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000;
        if (attempt >= this.maxRetries || ms > this.maxRetryAfterMs) {
          throw new LumaApiError(`Luma rate limit hit on ${path}; retry after ${ms}ms`, 429, true);
        }
        await this.wait(ms, 'rate_limit');
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= this.maxRetries) {
          throw new LumaApiError(`Luma ${path} failed with ${res.status}`, res.status, true);
        }
        await this.wait(this.backoff(attempt), 'server_error');
        continue;
      }
      if (res.status === 404 && allowNotFound) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) {
        // Body may echo request details; keep only a short snippet.
        const snippet = (await res.text().catch(() => '')).slice(0, 200);
        throw new LumaApiError(`Luma ${path} failed with ${res.status}: ${snippet}`, res.status, false);
      }

      const json: unknown = await res.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new LumaContractError(
          path,
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join('; '),
        );
      }
      return parsed.data;
    }
  }

  private backoff(attempt: number): number {
    return Math.min(500 * 2 ** attempt, 8_000) + Math.floor(Math.random() * 250);
  }

  private async wait(ms: number, reason: 'rate_limit' | 'server_error' | 'network'): Promise<void> {
    this.opts.onWait?.(ms, reason);
    await this.sleep(ms);
  }

  private trackWindow(res: Response): void {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = parseReset(res.headers.get('x-ratelimit-reset'), this.now());
      if (reset) this.notBefore = Math.max(this.notBefore, reset);
    }
  }

  private async waitForWindow(): Promise<void> {
    const ms = this.notBefore - this.now();
    if (ms > 0) await this.wait(Math.min(ms, this.maxRetryAfterMs), 'rate_limit');
  }
}
