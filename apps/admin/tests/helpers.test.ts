import { describe, expect, it } from 'vitest';
import { describeAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/errors';
import { summarizeTypes } from '@/lib/format';
import { extractLumaEventId } from '@/lib/luma-id';
import { isEventMediaPath, mediaPath, validateImage } from '@/lib/media-rules';
import { pageFromParam, sanitizeSearch } from '@/lib/search';
import { parseAccess } from '@/lib/staff';

const EVENT = 'ab915dc9-b772-4c09-bd05-e6ea95246df7';

describe('media rules', () => {
  it('accepts images up to 5 MB only', () => {
    expect(validateImage({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateImage({ type: 'application/pdf', size: 1000 })).toMatch(/JPEG/);
    expect(validateImage({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });

  it('puts files under the event folder that storage RLS checks', () => {
    expect(mediaPath(EVENT, 'hero', 'image/webp', 'abc')).toBe(`${EVENT}/hero/abc.webp`);
    expect(isEventMediaPath(EVENT, `${EVENT}/hero/abc.webp`)).toBe(true);
    expect(isEventMediaPath(EVENT, `other/${EVENT}/x.png`)).toBe(false);
    expect(isEventMediaPath(EVENT, `${EVENT}/../other/x.png`)).toBe(false);
  });
});

describe('search', () => {
  it('strips characters that would break a PostgREST or() filter', () => {
    expect(sanitizeSearch('a,b),email.eq.x*')).toBe('a b email.eq.x');
    expect(sanitizeSearch('  Jane   Doe ')).toBe('Jane Doe');
    expect(sanitizeSearch(undefined)).toBe('');
  });

  it('parses page numbers defensively', () => {
    expect(pageFromParam('3')).toBe(3);
    expect(pageFromParam('-1')).toBe(1);
    expect(pageFromParam('abc')).toBe(1);
    expect(pageFromParam(['2', '5'])).toBe(2);
  });
});

describe('Luma event id', () => {
  it('finds the id in ids and links', () => {
    expect(extractLumaEventId('evt-sjZpNrnBWMYQFwm')).toBe('evt-sjZpNrnBWMYQFwm');
    expect(extractLumaEventId('https://luma.com/event/manage/evt-sjZpNrnBWMYQFwm/guests')).toBe('evt-sjZpNrnBWMYQFwm');
    expect(extractLumaEventId('not an event')).toBeNull();
  });
});

describe('staff access', () => {
  it('parses invite access values', () => {
    expect(parseAccess('admin')).toEqual({ make_admin: true });
    expect(parseAccess(`${EVENT}:manager`)).toEqual({ make_admin: false, event_id: EVENT, role: 'manager' });
    expect(parseAccess(`${EVENT}:owner`)).toBeNull();
    expect(parseAccess('nope:staff')).toBeNull();
  });
});

describe('display helpers', () => {
  it('maps RPC errors to friendly text', () => {
    expect(friendlyError({ message: 'ticket_not_entry' })).toMatch(/add-on/);
    expect(friendlyError('new row violates row-level security policy')).toMatch(/permission/);
    expect(friendlyError({ message: 'email rate limit exceeded' })).toMatch(/Wait about an hour/);
    expect(friendlyError(null)).toMatch(/Something went wrong/);
  });

  it('summarises ticket types', () => {
    expect(summarizeTypes(['GA', 'GA', 'VIP'])).toBe('2× GA, VIP');
    expect(summarizeTypes([])).toBe('—');
  });

  it('describes audit rows', () => {
    expect(describeAudit({ action: 'undo_check_in', entity: 'check_ins', before: null, after: null })).toBe('Undid a check-in');
    expect(describeAudit({ action: 'perk_adjust', entity: 'perk_redemptions', before: null, after: { quantity: -2 } })).toBe(
      'Adjusted a perk balance (+2)',
    );
    expect(describeAudit({ action: 'update', entity: 'perks', before: null, after: { name: 'Drink Token' } })).toBe(
      'Updated a perk: Drink Token',
    );
  });
});
