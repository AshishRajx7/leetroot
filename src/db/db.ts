import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  config,
  validateDatabaseSafety,
  extractDatabaseName,
} from '../config/env';
import { maskConnectionUrl } from '../config/readiness';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isPostgresAvailable = false;

// Fallback in-memory store in case Postgres is not running locally
export interface InMemoryDb {
  repos: any[];
  scans: any[];
  leetcode_tags: any[];
  code_examples: any[];
  code_example_tags: any[];
  leetcode_problems: any[];
  leetcode_problem_tags: any[];
}

export const inMemoryDb: InMemoryDb = {
  repos: [],
  scans: [],
  leetcode_tags: [],
  code_examples: [],
  code_example_tags: [],
  leetcode_problems: [],
  leetcode_problem_tags: [],
};

let autoIncIds: { [table: string]: number } = {
  repos: 1,
  scans: 1,
  leetcode_tags: 1,
  code_examples: 1,
  code_example_tags: 1,
  leetcode_problems: 1,
  leetcode_problem_tags: 1,
};

export function getNextId(table: keyof InMemoryDb): number {
  return autoIncIds[table]++;
}

export async function initDb(): Promise<boolean> {
  const isTest = process.env.NODE_ENV === 'test' || config.isTest;

  if (isTest) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        `[DB ERROR] Database initialization in test mode strictly requires process.env.NODE_ENV === 'test'. ` +
        `Current process.env.NODE_ENV is '${process.env.NODE_ENV}'.`
      );
    }
    validateDatabaseSafety(config.database.url, 'test', 'leetroot_test');
    const dbName = extractDatabaseName(config.database.url);
    if (dbName !== 'leetroot_test') {
      throw new Error(
        `[DB ERROR] Database connection must strictly target 'leetroot_test' in test mode. ` +
        `Target is '${dbName}' from '${maskConnectionUrl(config.database.url)}'.`
      );
    }
  }

  try {
    pool = new Pool({
      connectionString: config.database.url,
      connectionTimeoutMillis: 3000,
      max: 20,
    });

    const client = await pool.connect();
    isPostgresAvailable = true;
    console.log('[DB] Successfully connected to PostgreSQL at', maskConnectionUrl(config.database.url));
    
    try {
      // Execute schema migrations
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        try {
          await client.query(sql);
          console.log('[DB] Applied schema.sql successfully');
        } catch (schemaErr: any) {
          if (schemaErr.message.includes('uq_code_examples_location') && !isTest) {
            console.warn(
              '[DB Warning] Unique index uq_code_examples_location could not be created on existing development database due to legacy duplicate rows:',
              schemaErr.message
            );
          } else {
            throw schemaErr;
          }
        }
      }
    } finally {
      client.release();
    }
    return true;
  } catch (err: any) {
    isPostgresAvailable = false;
    if (pool) {
      try {
        await pool.end();
      } catch {}
      pool = null;
    }
    if (isTest) {
      throw new Error(
        `[DB ERROR] PostgreSQL connection failed in test mode: ${err.message}. Refusing in-memory fallback.`
      );
    }
    console.warn('[DB] PostgreSQL connection failed (will use memory store fallback):', err.message);
    return false;
  }
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  if (isPostgresAvailable && pool) {
    return pool.query<T>(text, params);
  }
  throw new Error('Postgres not connected. Use high-level query functions or start Postgres.');
}

export function getIsPostgresConnected(): boolean {
  return isPostgresAvailable;
}

export function getDbPool(): Pool | null {
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch {}
    pool = null;
  }
  isPostgresAvailable = false;
}
