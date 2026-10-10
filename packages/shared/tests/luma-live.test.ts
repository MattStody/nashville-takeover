import { describe, expect, it } from 'vitest';
import {
  LiveLumaAdapter,
  LumaApiError,
  LumaContractError,
  guestKeyFromQr,
  parseLumaWebhook,
  safeEqual,
  webhookReceiptId,
} from '../src/index.ts';
import { LumaHttp } from '../src/luma/live/http.ts';
import { RawGuestListSchema } from '../src/luma/live/raw.ts';
import { EVENT_ID, fakeFetch, json, rawGuest, rawTicket } from './luma-fixtures.ts';

function adapter(responses: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch(responses);
  const sleeps: number[] = [];
  const a = new LiveLumaAdapter({
    apiKey: 'secret-key-123',
    fetch: f.impl,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { a, calls: f.calls, sleeps };
}

describe('LiveLumaAdapter', () => {
  it('calls the documented endpoint with the API key header', async () => {
    const { a, calls } = adapter([json({ entries: [rawGuest(1)], has_more: false })]);
    await a.listGuests(EVENT_ID);
    const [call] = calls;
    expect(call!.url.origin + call!.url.pathname).toBe('https://public-api.luma.com/v1/events/guests/list');
    expect(call!.url.searchParams.get('event_id')).toBe(EVENT_ID);
    expect(call!.url.searchParams.get('pagination_limit')).toBe('50');
    expect(call!.headers.get('x-luma-api-key')).toBe('secret-key-123');
  });

  it('normalises guests and drops payment and personal fields', async () => {
    const { a } = adapter([json({ entries: [rawGuest(7)], has_more: false })]);
    const page = await a.listGuests(EVENT_ID);
    expect(page).toEqual({
      entries: [
        {
          id: 'gst-7',
          eventId: EVENT_ID,
          guestKey: 'g-key7',
          name: 'Person 7',
          email: 'person7@example.com',
          approvalStatus: 'approved',
          tickets: [{ id: 'eventticket-7', ticketTypeId: 'evtticktyp-ga', ticketTypeName: 'General Admission' }],
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(page)).not.toMatch(/amount|currency|order|phone|answers|utm|4500/);
  });

  it('falls back to first + last name, then null', async () => {
    const { a } = adapter([
      json({
        entries: [
          rawGuest(1, { user_name: null }),
          rawGuest(2, { user_name: ' ', user_first_name: null, user_last_name: null }),
        ],
        has_more: false,
      }),
    ]);
    const { entries } = await a.listGuests(EVENT_ID);
    expect(entries.map((g) => g.name)).toEqual(['Person 1', null]);
  });

  it('follows next_cursor and stops when has_more is false', async () => {
    const { a, calls } = adapter([
      json({ entries: [rawGuest(1)], has_more: true, next_cursor: 'c2' }),
      json({ entries: [rawGuest(2)], has_more: false, next_cursor: 'ignored' }),
    ]);
    const p1 = await a.listGuests(EVENT_ID);
    expect(p1.nextCursor).toBe('c2');
    const p2 = await a.listGuests(EVENT_ID, { cursor: p1.nextCursor });
    expect(p2.nextCursor).toBeNull();
    expect(calls[1]!.url.searchParams.get('pagination_cursor')).toBe('c2');
  });

  it('fails loudly when a guest has no guest key', async () => {
    const { a } = adapter([json({ entries: [rawGuest(1, { check_in_qr_code: 'nonsense' })], has_more: false })]);
    await expect(a.listGuests(EVENT_ID)).rejects.toBeInstanceOf(LumaContractError);
  });

  it('fails loudly on an unexpected response shape', async () => {
    const { a } = adapter([json({ guests: [] })]);
    await expect(a.listGuests(EVENT_ID)).rejects.toThrow(/Unexpected Luma response.*entries/);
  });

  it('looks up a guest by any identifier and returns null on 404', async () => {
    const { a, calls } = adapter([json(rawGuest(3)), json({ message: 'not found' }, 404)]);
    expect((await a.getGuest(EVENT_ID, 'TICKETKEY1'))?.id).toBe('gst-3');
    expect(calls[0]!.url.pathname).toBe('/v1/events/guests/get');
    expect(calls[0]!.url.searchParams.get('id')).toBe('TICKETKEY1');
    expect(await a.getGuest(EVENT_ID, 'nope')).toBeNull();
  });

  it('lists ticket types including hidden ones, without prices', async () => {
    const { a, calls } = adapter([
      json({
        entries: [
          { id: 'tt1', name: 'GA', type: 'paid', cents: 4500, currency: 'usd', is_hidden: false },
          { id: 'tt2', name: 'Artist', type: 'free', is_hidden: true },
        ],
      }),
    ]);
    const types = await a.listTicketTypes(EVENT_ID);
    expect(types).toEqual([
      { id: 'tt1', eventId: EVENT_ID, name: 'GA', isHidden: false },
      { id: 'tt2', eventId: EVENT_ID, name: 'Artist', isHidden: true },
    ]);
    expect(calls[0]!.url.searchParams.get('include_hidden')).toBe('true');
  });

  it('reads the managed event shape', async () => {
    const { a } = adapter([
      json({
        id: EVENT_ID,
        name: 'Test',
        start_at: '2026-11-14T00:00:00.000Z',
        end_at: '2026-11-14T06:00:00.000Z',
        timezone: 'America/Chicago',
        access: 'manage',
      }),
    ]);
    expect(await a.getEvent(EVENT_ID)).toEqual({
      id: EVENT_ID,
      name: 'Test',
      startAt: '2026-11-14T00:00:00.000Z',
      endAt: '2026-11-14T06:00:00.000Z',
      timezone: 'America/Chicago',
    });
  });
});

describe('LumaHttp rate limits and retries', () => {
  function http(responses: Parameters<typeof fakeFetch>[0], now = () => 1_000_000) {
    const f = fakeFetch(responses);
    const sleeps: number[] = [];
    const h = new LumaHttp({ apiKey: 'k', fetch: f.impl, sleep: async (ms) => void sleeps.push(ms), now });
    const get = () => h.get('/v1/events/guests/list', { event_id: EVENT_ID }, RawGuestListSchema);
    return { get, sleeps, calls: f.calls };
  }
  const ok = () => json({ entries: [], has_more: false });

  it('honours Retry-After on 429 and then succeeds', async () => {
    const { get, sleeps } = http([json({}, 429, { 'retry-after': '42' }), ok()]);
    await get();
    expect(sleeps).toEqual([42_000]);
  });

  it('gives up after max retries on persistent 429', async () => {
    const r429 = () => json({}, 429, { 'retry-after': '1' });
    const { get } = http([r429(), r429(), r429(), r429()]);
    await expect(get()).rejects.toMatchObject({ name: 'LumaApiError', status: 429, retryable: true });
  });

  it('does not wait longer than the cap for one 429', async () => {
    const { get, sleeps } = http([json({}, 429, { 'retry-after': '600' })]);
    await expect(get()).rejects.toBeInstanceOf(LumaApiError);
    expect(sleeps).toEqual([]);
  });

  it('retries 5xx and network errors with backoff', async () => {
    const { get, sleeps } = http([json({}, 502), new TypeError('fetch failed'), ok()]);
    await get();
    expect(sleeps).toHaveLength(2);
    expect(sleeps.every((ms) => ms >= 500 && ms < 10_000)).toBe(true);
  });

  it('does not retry auth errors, and never echoes the API key', async () => {
    const { get, calls } = http([json({ message: 'Invalid API key' }, 401)]);
    const err = (await get().then(
      () => null,
      (e: unknown) => e,
    )) as LumaApiError;
    expect(err).toMatchObject({ status: 401, retryable: false });
    expect(err.message).not.toContain('secret');
    expect(calls).toHaveLength(1);
  });

  it('paces the next request when the window is exhausted', async () => {
    let t = Date.parse('2026-10-10T18:00:00Z');
    const { get, sleeps } = http(
      [json({ entries: [], has_more: false }, 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String((t + 30_000) / 1000) }), ok()],
      () => t,
    );
    await get();
    t += 1000;
    await get();
    expect(sleeps).toEqual([29_000]);
  });
});

describe('webhooks', () => {
  const event = { id: EVENT_ID, name: 'X', start_at: '2026-11-14T00:00:00.000Z' };

  it('parses guest webhooks into normalised guests', () => {
    for (const type of ['guest.registered', 'guest.updated', 'ticket.registered']) {
      const parsed = parseLumaWebhook({
        type,
        data: { ...rawGuest(5), event, event_ticket: rawTicket('eventticket-5') },
      });
      expect(parsed).toMatchObject({ kind: 'guest', type, lumaEventId: EVENT_ID, guest: { id: 'gst-5', guestKey: 'g-key5' } });
      expect(JSON.stringify(parsed)).not.toMatch(/amount|currency|phone/);
    }
  });

  it('ignores other webhook types', () => {
    expect(parseLumaWebhook({ type: 'guest.refunded', data: {} })).toEqual({ kind: 'ignored', type: 'guest.refunded' });
    expect(parseLumaWebhook({ type: 'event.updated', data: {} })).toEqual({ kind: 'ignored', type: 'event.updated' });
  });

  it('rejects malformed guest payloads', () => {
    expect(() => parseLumaWebhook({ type: 'guest.updated', data: { id: 'gst-1' } })).toThrow();
    expect(() => parseLumaWebhook({ nope: true })).toThrow();
  });

  it('derives a stable receipt id and compares tokens safely', async () => {
    expect(await webhookReceiptId('{"a":1}')).toBe(await webhookReceiptId('{"a":1}'));
    expect(await webhookReceiptId('{"a":1}')).not.toBe(await webhookReceiptId('{"a":2}'));
    expect(await webhookReceiptId('x')).toMatch(/^[0-9a-f]{64}$/);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('extracts guest keys from QR codes or bare keys', () => {
    expect(guestKeyFromQr(`https://luma.com/check-in/${EVENT_ID}?pk=g-abc1`)).toBe('g-abc1');
    expect(guestKeyFromQr('g-abc1')).toBe('g-abc1');
    expect(guestKeyFromQr(`https://luma.com/check-in/${EVENT_ID}?pk=TICKETKEY`)).toBeNull();
  });
});

describe('webhook registration', () => {
  it('lists webhooks across pages and never keeps their secrets', async () => {
    const { a, calls } = adapter([
      json({ entries: [{ id: 'wh1', url: 'https://a', event_types: ['*'], status: 'active', secret: 'S1' }], has_more: true, next_cursor: 'n' }),
      json({ entries: [{ id: 'wh2', url: 'https://b', event_types: ['guest.updated'], status: 'paused', secret: 'S2' }], has_more: false }),
    ]);
    const hooks = await a.listWebhooks();
    expect(hooks).toEqual([
      { id: 'wh1', url: 'https://a', eventTypes: ['*'], status: 'active' },
      { id: 'wh2', url: 'https://b', eventTypes: ['guest.updated'], status: 'paused' },
    ]);
    expect(JSON.stringify(hooks)).not.toMatch(/S1|S2|secret/);
    expect(calls[0]!.url.pathname).toBe('/v1/webhooks/list');
    expect(calls[1]!.url.searchParams.get('pagination_cursor')).toBe('n');
  });

  it('creates a webhook with a JSON POST', async () => {
    const f = fakeFetch([json({ id: 'wh9', url: 'https://x', event_types: ['guest.updated'], status: 'active', secret: 'S' })]);
    let sent: RequestInit | undefined;
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      sent = init;
      return f.impl(input, init);
    }) as typeof fetch;
    const a = new LiveLumaAdapter({ apiKey: 'k', fetch: spy, sleep: async () => {} });
    const hook = await a.createWebhook('https://x', ['guest.updated']);
    expect(hook).toEqual({ id: 'wh9', url: 'https://x', eventTypes: ['guest.updated'], status: 'active' });
    expect(f.calls[0]!.url.pathname).toBe('/v2/webhooks/create');
    expect(sent?.method).toBe('POST');
    expect(JSON.parse(String(sent?.body))).toEqual({ url: 'https://x', event_types: ['guest.updated'] });
    expect(new Headers(sent?.headers).get('content-type')).toBe('application/json');
  });

  it('does not retry a POST after a server error (it may have succeeded)', async () => {
    const { a, calls, sleeps } = adapter([json({}, 502), json({ id: 'dup', url: 'u', event_types: [] })]);
    await expect(a.createWebhook('https://x', ['*'])).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('does retry a POST after a 429 (Luma rejected it before acting)', async () => {
    const { a, calls } = adapter([json({}, 429, { 'retry-after': '1' }), json({ id: 'wh', url: 'u', event_types: [] })]);
    expect((await a.createWebhook('https://x', ['*'])).id).toBe('wh');
    expect(calls).toHaveLength(2);
  });

  it('mock adapter keeps webhooks in memory', async () => {
    const { MockLumaAdapter } = await import('../src/index.ts');
    const m = new MockLumaAdapter();
    expect(await m.listWebhooks()).toEqual([]);
    await m.createWebhook('https://x', ['guest.updated']);
    expect((await m.listWebhooks()).map((w) => w.url)).toEqual(['https://x']);
  });
});
