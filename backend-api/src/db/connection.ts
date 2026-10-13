import { Pool } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      logger.error(err, 'Unexpected PostgreSQL client error');
    });
  }
  return pool;
}

export async function connectDatabase(): Promise<void> {
  const db = getPool();
  const client = await db.connect();
  client.release();
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const db = getPool();
  const start = Date.now();
  const res = await db.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development' && duration > 100) {
    logger.warn({ query: text, duration }, 'Slow query detected');
  }

  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
