// Copies the runtime parts of packages/shared/src into supabase/functions/_shared/nt
// so edge functions import it without reaching outside supabase/functions
// (which Supabase's bundler does not reliably include). A test fails if the
// copy drifts; run `pnpm functions:vendor` after changing shared code.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SRC = fileURLToPath(new URL('../src', import.meta.url));
export const DEST = fileURLToPath(new URL('../../../supabase/functions/_shared/nt', import.meta.url));
/** Not needed at runtime by edge functions. */
const EXCLUDE = ['seed'];
export const HEADER = '// GENERATED from packages/shared/src by `pnpm functions:vendor`. Do not edit.\n';

export function vendoredFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(SRC, full);
      if (EXCLUDE.some((e) => rel === e || rel.startsWith(`${e}/`))) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts')) out.set(rel, HEADER + readFileSync(full, 'utf8'));
    }
  };
  walk(SRC);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  rmSync(DEST, { recursive: true, force: true });
  for (const [rel, content] of vendoredFiles()) {
    const target = join(DEST, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  console.log(`Vendored shared code into ${DEST}`);
}
