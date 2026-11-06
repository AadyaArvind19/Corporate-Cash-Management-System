import { Pool, PoolClient, QueryResultRow } from 'pg';
import { env } from './env';

const g = globalThis as unknown as { __ccmsPool?: Pool };

export function pool(): Pool {
  if (!g.__ccmsPool) {
    g.__ccmsPool = new Pool({ connectionString: env.databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
    // An idle connection dropped by the server must not crash the process; the pool replaces it.
    g.__ccmsPool.on('error', (e) => console.error('[pg] idle client error:', e.message));
  }
  return g.__ccmsPool;
}

/** Parameterised query; values are never interpolated into SQL text. */
export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params as any[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** Runs fn inside a single database transaction (COMMIT on success, ROLLBACK on any error). */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
