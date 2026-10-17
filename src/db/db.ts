import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/env';
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
  try {
    pool = new Pool({
      connectionString: config.database.url,
      connectionTimeoutMillis: 3000,
      max: 20,
    });

    const client = await pool.connect();
    isPostgresAvailable = true;
    console.log('[DB] Successfully connected to PostgreSQL at', config.database.url.replace(/:[^:@]*@/, ':****@'));
    
    // Execute schema migrations
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log('[DB] Applied schema.sql successfully');
    }
    client.release();
    return true;
  } catch (err: any) {
    console.warn('[DB] PostgreSQL connection failed (will use memory store fallback):', err.message);
    isPostgresAvailable = false;
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

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
  }
}
