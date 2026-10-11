/**
 * Makes user text safe inside a PostgREST `or=(…ilike…)` filter: drops the
 * characters that would change the filter's structure or act as wildcards.
 */
export function sanitizeSearch(input: string | undefined | null): string {
  return (input ?? '')
    .replace(/[,()*%\\:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

export const PAGE_SIZE = 50;

export function pageFromParam(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 1 ? Math.min(n, 10000) : 1;
}
