import pg from 'pg';
import { databaseOptions } from './connectionOptions.js';

export function createPool(env = process.env) {
  const pool = new pg.Pool(databaseOptions(env));
  pool.on('error', error => console.error(JSON.stringify({ event: 'database_pool_error', code: error.code || 'UNKNOWN' })));
  return pool;
}
