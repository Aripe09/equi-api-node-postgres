export function databaseOptions(env = process.env) {
  const common = {
    max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
    query_timeout: 10000, statement_timeout: 10000, application_name: 'equi-api'
  };
  if (!env.DATABASE_URL) return {
    ...common, host: env.PGHOST || 'postgres', port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE || 'equi_db', user: env.PGUSER, password: env.PGPASSWORD,
    ssl: false
  };
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL invalida'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error('DATABASE_URL invalida');
  const mode = env.DATABASE_SSL_MODE || url.searchParams.get('sslmode') || 'verify-full';
  if (!['require', 'verify-full'].includes(mode)) throw new Error('DATABASE_SSL_MODE debe ser require o verify-full');
  for (const key of ['sslcert', 'sslkey', 'sslrootcert']) {
    if (url.searchParams.has(key)) throw new Error('Configura certificados mediante DATABASE_SSL_CA, no en la URL');
  }
  // pg no debe reemplazar el objeto ssl con opciones extraidas de sslmode.
  url.searchParams.delete('sslmode');
  return {
    ...common, connectionString: url.toString(),
    ssl: { rejectUnauthorized: mode === 'verify-full', ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) }
  };
}

export function migrationsEnabled(env = process.env) {
  if (env.RUN_MIGRATIONS && !['true', 'false'].includes(env.RUN_MIGRATIONS)) throw new Error('RUN_MIGRATIONS debe ser true o false');
  if (env.RUN_MIGRATIONS !== 'true') return false;
  if (!env.DATABASE_URL) throw new Error('Migraciones requieren DATABASE_URL explicita');
  return true;
}
