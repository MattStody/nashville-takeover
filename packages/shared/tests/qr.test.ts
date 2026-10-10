import { describe, expect, it } from 'vitest';
import { buildCheckInQr, describeQrForEvent, parseCheckInQr } from '../src/qr/parse.ts';

const EVT = 'evt-sjZpNrnBWMYQFwm';

describe('parseCheckInQr', () => {
  it('parses a guest-key QR', () => {
    expect(parseCheckInQr(`https://luma.com/check-in/${EVT}?pk=g-AbC123xyz`)).toEqual({
      ok: true,
      value: { lumaEventId: EVT, key: 'g-AbC123xyz', kind: 'guest' },
    });
  });

  it('parses a ticket-key QR', () => {
    const r = parseCheckInQr(`https://luma.com/check-in/${EVT}?pk=Xy7kQ2mN9p`);
    expect(r).toEqual({ ok: true, value: { lumaEventId: EVT, key: 'Xy7kQ2mN9p', kind: 'ticket' } });
  });

  it('tolerates whitespace, missing scheme, lu.ma, www, trailing slash and extra params', () => {
    for (const text of [
      `  https://luma.com/check-in/${EVT}?pk=g-abc1  \n`,
      `luma.com/check-in/${EVT}?pk=g-abc1`,
      `https://lu.ma/check-in/${EVT}?pk=g-abc1`,
      `https://www.luma.com/check-in/${EVT}/?pk=g-abc1&utm_source=x`,
      `HTTPS://LUMA.COM/check-in/${EVT}?pk=g-abc1`,
    ]) {
      const r = parseCheckInQr(text);
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(r.value.key).toBe('g-abc1');
    }
  });

  it('rejects everything else with a specific reason', () => {
    const cases: [string, string][] = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['not a url at all', 'not_a_url'],
      ['g-abc1', 'not_luma'],
      [`https://evil.com/check-in/${EVT}?pk=g-abc1`, 'not_luma'],
      [`https://luma.com.evil.com/check-in/${EVT}?pk=g-abc1`, 'not_luma'],
      [`ftp://luma.com/check-in/${EVT}?pk=g-abc1`, 'not_a_url'],
      [`https://luma.com/${EVT}?pk=g-abc1`, 'not_check_in'],
      [`https://luma.com/check-in/${EVT}/extra?pk=g-abc1`, 'not_check_in'],
      ['https://luma.com/check-in/nope?pk=g-abc1', 'bad_event_id'],
      [`https://luma.com/check-in/${EVT}`, 'missing_key'],
      [`https://luma.com/check-in/${EVT}?pk=`, 'missing_key'],
      [`https://luma.com/check-in/${EVT}?pk=a%20b%3Cscript%3E`, 'bad_key'],
      [`https://luma.com/check-in/${EVT}?pk=ab`, 'bad_key'],
    ];
    for (const [text, error] of cases) expect(parseCheckInQr(text), text).toEqual({ ok: false, error });
  });

  it('round-trips with buildCheckInQr', () => {
    const r = parseCheckInQr(buildCheckInQr(EVT, 'g-round1'));
    expect(r).toEqual({ ok: true, value: { lumaEventId: EVT, key: 'g-round1', kind: 'guest' } });
  });

  it('flags codes for a different event', () => {
    const r = parseCheckInQr(`https://luma.com/check-in/evt-other123?pk=g-abc1`);
    expect(describeQrForEvent(r, EVT)).toEqual({ ok: false, error: 'wrong_event' });
    expect(describeQrForEvent(parseCheckInQr(buildCheckInQr(EVT, 'g-abc1')), EVT).ok).toBe(true);
    expect(describeQrForEvent(parseCheckInQr(''), EVT)).toEqual({ ok: false, error: 'empty' });
  });
});
