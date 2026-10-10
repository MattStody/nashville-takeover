import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, expect, inject } from 'vitest';

export type Row = Record<string, any>;

/**
 * One connection per test file. Every test runs inside a transaction that is
 * rolled back, so tests never see each other's data.
 */
export class TestDb {
  constructor(private readonly client: pg.Client) {}

  /** Run as the database owner (bypasses RLS), like the service role/migrations. */
  async sql<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    await this.client.query('reset role');
    await this.client.query(`select set_config('request.jwt.claims', '', true)`);
    return (await this.client.query(text, params)).rows as T[];
  }

  /** Run as an authenticated user (or anon when userId is null), with RLS. */
  async as<T extends Row = Row>(userId: string | null, text: string, params: unknown[] = []): Promise<T[]> {
    await this.client.query('reset role');
    const claims = userId
      ? JSON.stringify({ sub: userId, role: 'authenticated' })
      : JSON.stringify({ role: 'anon' });
    await this.client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await this.client.query(`set local role ${userId ? 'authenticated' : 'anon'}`);
    // On error the transaction is aborted; expectError's savepoint rollback
    // restores the role, so only reset on success.
    const rows = (await this.client.query(text, params)).rows as T[];
    await this.client.query('reset role');
    return rows;
  }

  /** Run as the service_role (edge functions), with no user. */
  async asService<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    await this.client.query('reset role');
    await this.client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'service_role' })]);
    await this.client.query('set local role service_role');
    const rows = (await this.client.query(text, params)).rows as T[];
    await this.client.query('reset role');
    return rows;
  }

  /** Expect a statement to fail; a savepoint keeps the test transaction usable. */
  async expectError(
    userId: string | null | 'owner' | 'service',
    text: string,
    params: unknown[],
    match: { code?: string; message?: RegExp },
  ): Promise<void> {
    await this.client.query('savepoint expect_error');
    let error: (Error & { code?: string }) | undefined;
    try {
      if (userId === 'owner') await this.sql(text, params);
      else if (userId === 'service') await this.asService(text, params);
      else await this.as(userId, text, params);
    } catch (e) {
      error = e as Error & { code?: string };
    }
    await this.client.query('rollback to savepoint expect_error');
    await this.client.query('reset role');
    expect(error, `expected error for: ${text}`).toBeDefined();
    if (match.code) expect(error?.code).toBe(match.code);
    if (match.message) expect(error?.message).toMatch(match.message);
  }
}

export function useTestDb(): () => TestDb {
  let client: pg.Client;
  let db: TestDb;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: inject('dbUrl') });
    await client.connect();
    db = new TestDb(client);
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await client.query('begin');
  });
  afterEach(async () => {
    await client.query('rollback');
  });

  return () => db;
}
