import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseForm } from '@/lib/actions';
import { checkbox, email, hexColor, reason, slug } from '@/lib/schemas';
import { checkOrder, wallTimesToUtc } from '@/lib/time-form';

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
};

describe('parseForm', () => {
  it('trims values and turns blanks into undefined', () => {
    const r = parseForm(z.object({ a: z.string(), b: z.string().optional() }), form({ a: '  hi ', b: '   ' }));
    expect(r.success && r.data).toEqual({ a: 'hi' });
  });

  it('reads checkboxes as booleans', () => {
    const schema = z.object({ on: checkbox, off: checkbox });
    const r = parseForm(schema, form({ on: 'on' }));
    expect(r.success && r.data).toEqual({ on: true, off: false });
  });
});

describe('field schemas', () => {
  it('validates colours and slugs', () => {
    expect(hexColor.parse('#B3202A')).toBe('#b3202a');
    expect(hexColor.safeParse('red').success).toBe(false);
    expect(slug.safeParse('nashville-takeover-2026').success).toBe(true);
    expect(slug.safeParse('Bad Slug').success).toBe(false);
  });

  it('normalises emails and requires real reasons', () => {
    expect(email.parse('  Matt@Example.COM ')).toBe('matt@example.com');
    expect(reason.safeParse('').success).toBe(false);
    expect(reason.safeParse('ok').success).toBe(false);
    expect(reason.safeParse('scanned wrong guest').success).toBe(true);
  });
});

describe('wallTimesToUtc', () => {
  it('converts event-local times to UTC', () => {
    const r = wallTimesToUtc({ starts_at: '2026-11-13T19:30', ends_at: undefined }, 'America/Chicago');
    expect(r).toEqual({ ok: true, value: { starts_at: '2026-11-14T01:30:00.000Z', ends_at: null } });
  });

  it('rejects impossible dates', () => {
    const r = wallTimesToUtc({ starts_at: '2026-02-30T10:00' }, 'America/Chicago');
    expect(r.ok).toBe(false);
  });

  it('checks ordering', () => {
    expect(checkOrder('2026-11-14T01:30:00Z', '2026-11-14T01:00:00Z')).toMatch(/after/);
    expect(checkOrder('2026-11-14T01:30:00Z', null)).toBeNull();
  });
});
