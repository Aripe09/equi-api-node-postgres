import pg from 'pg';

export function createPool(env = process.env) {
  const pool = new pg.Pool({
    host: env.PGHOST || 'postgres',
    port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE || 'equi_db',
    user: env.PGUSER,
    password: env.PGPASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    statement_timeout: 10000,
    application_name: 'equi-api'
  });
  pool.on('error', error => console.error(JSON.stringify({ event: 'database_pool_error', code: error.code || 'UNKNOWN' })));
  return pool;
}
