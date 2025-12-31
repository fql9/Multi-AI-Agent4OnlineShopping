/**
 * Database connection module
 */

import * as pg from 'pg';
import { createLogger } from '@shopping-agent/common';

const { Pool } = pg;
const logger = createLogger('core-mcp:db');

// Database configuration
// Note: Pool creation is lazy - connections are only established when needed
const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  user: process.env.DB_USER ?? 'agent',
  password: process.env.DB_PASSWORD ?? 'agent_dev_password',
  database: process.env.DB_NAME ?? 'agent_db',
  max: parseInt(process.env.DB_POOL_MAX ?? '20'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT ?? '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT ?? '2000'),
  // SSL configuration (recommended for production)
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  } : false,
});

// Connection event handlers
pool.on('connect', (client) => {
  logger.info({
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  }, 'Database client connected');
});

pool.on('error', (err: Error) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    name: err.name,
  }, 'Unexpected error on idle database client');
  // Don't throw - let the pool handle reconnection
});

pool.on('acquire', () => {
  logger.debug('Database client acquired from pool');
});

pool.on('remove', () => {
  logger.debug('Database client removed from pool');
});

export { pool };

/**
 * Execute a query
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    logger.debug({ query: text.substring(0, 100), paramCount: params?.length ?? 0 }, 'Executing query');
    const result = await client.query(text, params);
    logger.debug({ rowCount: result.rows.length }, 'Query completed');
    return result.rows as T[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      {
        error: errorMessage,
        stack: errorStack,
        query: text.substring(0, 100),
      },
      'Query execution failed'
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a query and return a single row
 */
export async function queryOne<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');
    const result = await callback(client);
    await client.query('COMMIT');
    logger.debug('Transaction committed');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      logger.error({ error: rollbackError }, 'Failed to rollback transaction');
    });
    logger.error({ error: e }, 'Transaction rolled back');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 * This can be called during startup to verify connectivity
 */
export async function testConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Database connection test failed');
    return false;
  }
}

export default pool;

