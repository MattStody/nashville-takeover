/** ["GA","GA","VIP"] -> "2× GA, VIP" */
export function summarizeTypes(names: string[]): string {
  if (names.length === 0) return '—';
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(', ');
}
