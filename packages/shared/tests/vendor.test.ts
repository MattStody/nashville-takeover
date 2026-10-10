import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEST, vendoredFiles } from '../scripts/vendor-functions.ts';

describe('supabase/functions/_shared/nt', () => {
  it('matches packages/shared/src (run `pnpm functions:vendor`)', () => {
    const expected = vendoredFiles();
    const actual = new Map<string, string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else actual.set(relative(DEST, full), readFileSync(full, 'utf8'));
      }
    };
    expect(existsSync(DEST)).toBe(true);
    walk(DEST);
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [rel, content] of expected) expect(actual.get(rel), rel).toBe(content);
  });
});
