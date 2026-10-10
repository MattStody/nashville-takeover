import type { LumaAdapter, LumaMode } from './adapter.ts';
import type { LumaHttpOptions } from './live/http.ts';
import { LiveLumaAdapter } from './live/live-adapter.ts';
import { MockLumaAdapter } from './mock/mock-adapter.ts';

export * from './adapter.ts';
export * from './types.ts';
export { MockLumaAdapter } from './mock/mock-adapter.ts';
export { generateMockDataset, type MockDataset, type MockEvent } from './mock/fixtures.ts';
export { LiveLumaAdapter, guestKeyFromQr, normalizeGuest } from './live/live-adapter.ts';
export { LumaApiError, LumaContractError, LUMA_BASE_URL, type LumaHttpOptions } from './live/http.ts';
export { parseLumaWebhook, safeEqual, webhookReceiptId, type ParsedLumaWebhook } from './live/webhook.ts';
export { GUEST_WEBHOOK_TYPES } from './live/raw.ts';

export interface LumaEnv {
  LUMA_MODE?: string;
  LUMA_API_KEY?: string;
}

export function resolveLumaMode(env: LumaEnv): LumaMode {
  const mode = (env.LUMA_MODE ?? 'mock').trim().toLowerCase();
  if (mode !== 'mock' && mode !== 'live') {
    throw new Error(`LUMA_MODE must be "mock" or "live", got "${env.LUMA_MODE}"`);
  }
  return mode;
}

/** Picks the adapter from env. Defaults to mock so development needs no API key. */
export function createLumaAdapter(
  env: LumaEnv,
  httpOptions: Omit<LumaHttpOptions, 'apiKey'> = {},
): LumaAdapter {
  const mode = resolveLumaMode(env);
  if (mode === 'mock') return new MockLumaAdapter();
  if (!env.LUMA_API_KEY) throw new Error('LUMA_MODE=live requires LUMA_API_KEY');
  return new LiveLumaAdapter({ ...httpOptions, apiKey: env.LUMA_API_KEY });
}
