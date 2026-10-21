import { createPool } from '../src/config/database.js';
import { runMigrations } from '../src/database/migrate.js';

if (!process.env.DATABASE_URL) throw new Error('Se requiere DATABASE_URL explicita; no se migrara la base local por defecto');
const pool = createPool();
try {
  const applied = await runMigrations(pool);
  console.log(JSON.stringify({ event: 'migrations_complete', applied }));
} catch (error) {
  console.error(JSON.stringify({ event: 'migration_failed', code: error.code || 'MIGRATION_REJECTED' }));
  process.exitCode = 1;
} finally { await pool.end(); }
