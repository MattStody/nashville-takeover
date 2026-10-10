import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateSeedSql } from '../src/seed/sql.ts';

describe('supabase/seed.sql', () => {
  it('is up to date with the generator (run `pnpm seed:generate`)', () => {
    const onDisk = readFileSync(new URL('../../../supabase/seed.sql', import.meta.url), 'utf8');
    expect(onDisk).toBe(generateSeedSql());
  });

  it('only uses example.com emails', () => {
    const emails = generateSeedSql().match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((e) => e.endsWith('@example.com'))).toBe(true);
  });
});
