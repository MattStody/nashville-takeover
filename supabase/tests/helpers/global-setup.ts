import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

const SUPABASE_DIR = join(import.meta.dirname, '..', '..');
export const TEST_DB = 'nt_test';

export function migrationFiles(): string[] {
  const dir = join(SUPABASE_DIR, 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Creates a fresh database with the Supabase shim and every migration applied.
 * Plain Postgres only; against `supabase start` (auth schema already present)
 * the existing database is used as-is.
 */
export async function createMigratedDatabase(adminUrl: string, name: string): Promise<string> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(readFileSync(join(import.meta.dirname, 'supabase-shim.sql'), 'utf8'));
    for (const file of migrationFiles()) {
      await db.query(readFileSync(file, 'utf8'));
    }
  } finally {
    await db.end();
  }
  return url.toString();
}

async function hasAuthSchema(url: string): Promise<boolean> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query(`select 1 from pg_namespace where nspname = 'auth'`);
    return r.rowCount === 1;
  } finally {
    await c.end();
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_URL must point at a Postgres 15+ server (see README).');
  }
  const supabaseManaged = await hasAuthSchema(adminUrl);
  const url = supabaseManaged ? adminUrl : await createMigratedDatabase(adminUrl, TEST_DB);
  project.provide('dbUrl', url);
  project.provide('adminUrl', adminUrl);
  project.provide('supabaseManaged', supabaseManaged);
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
    adminUrl: string;
    supabaseManaged: boolean;
  }
}
