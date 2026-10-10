import type { LumaAdapter, LumaMode } from './adapter.ts';
import { LumaNotImplementedError } from './adapter.ts';
import { MockLumaAdapter } from './mock/mock-adapter.ts';

export * from './adapter.ts';
export * from './types.ts';
export { MockLumaAdapter } from './mock/mock-adapter.ts';
export { generateMockDataset, type MockDataset, type MockEvent } from './mock/fixtures.ts';

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
export function createLumaAdapter(env: LumaEnv): LumaAdapter {
  const mode = resolveLumaMode(env);
  if (mode === 'mock') return new MockLumaAdapter();
  if (!env.LUMA_API_KEY) throw new Error('LUMA_MODE=live requires LUMA_API_KEY');
  throw new LumaNotImplementedError('Live Luma adapter (Phase 2)');
}
