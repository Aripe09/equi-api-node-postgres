import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function loadMigrations() {
  const sql = await readFile(new URL('../../database/migrations/001-caballos.sql', import.meta.url), 'utf8');
  return [{ version: '001-caballos', sql, checksum: createHash('sha256').update(sql).digest('hex') }];
}

export async function runMigrations(pool, migrations = undefined) {
  const files = migrations || await loadMigrations();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query('SET LOCAL search_path = public');
    // El bloqueo vive en la transaccion: serializa arranques simultaneos.
    await client.query('SELECT pg_advisory_xact_lock(17483, 20401)');
    const exists = (await client.query("SELECT to_regclass('public.equi_schema_migrations') AS migrations, to_regclass('public.caballos') AS caballos")).rows[0];
    if (!exists.migrations && exists.caballos) throw new Error('La tabla caballos ya existe sin historial: se requiere revision manual; no se alteraron sus datos');
    await client.query('CREATE TABLE IF NOT EXISTS equi_schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const applied = (await client.query('SELECT version, checksum FROM equi_schema_migrations')).rows;
    for (const entry of applied) {
      const file = files.find(item => item.version === entry.version);
      if (!file || file.checksum !== entry.checksum) throw new Error('Historial de migraciones incompatible; no modificar migraciones ya aplicadas');
    }
    const completed = [];
    for (const file of files) {
      if (applied.some(entry => entry.version === file.version)) continue;
      await client.query(file.sql);
      await client.query('INSERT INTO equi_schema_migrations (version, checksum) VALUES ($1, $2)', [file.version, file.checksum]);
      completed.push(file.version);
    }
    await client.query('COMMIT');
    return completed;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preservar el error original. */ }
    throw error;
  } finally { client.release(); }
}
