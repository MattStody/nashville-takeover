import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateSeedSql } from '../src/seed/sql.ts';

const target = fileURLToPath(new URL('../../../supabase/seed.sql', import.meta.url));
writeFileSync(target, generateSeedSql());
console.log(`Wrote ${target}`);
