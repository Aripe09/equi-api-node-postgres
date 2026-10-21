import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { runMigrations } from '../../src/database/migrate.js';

test('PostgreSQL aislado: inicializacion, concurrencia, reinicio y base existente', async () => {
  // Nunca usa DATABASE_URL ni PGHOST: solo el servicio de pruebas dedicado.
  if (process.env.MIGRATION_TEST_HOST !== 'migration-postgres') throw new Error('Solo se admite el contenedor PostgreSQL desechable de pruebas');
  const pool = new pg.Pool({ host: 'migration-postgres', database: 'equi_migration_test', user: process.env.PGUSER, password: process.env.PGPASSWORD, connectionTimeoutMillis: 5000 });
  try {
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'equi_migration_test');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const results = await Promise.all([runMigrations(pool), runMigrations(pool)]);
    assert.equal(results.flat().length, 1);
    const original = (await pool.query('SELECT * FROM caballos ORDER BY id')).rows;
    assert.equal(original.length, 10);
    assert.equal(original[2].nombre, 'Zafiro');
    assert.deepEqual(await runMigrations(pool), []);
    assert.deepEqual((await pool.query('SELECT * FROM caballos ORDER BY id')).rows, original);
    await pool.query("UPDATE caballos SET propietario = 'Cambio de prueba' WHERE id = 3");
    assert.deepEqual(await runMigrations(pool), []);
    assert.equal((await pool.query('SELECT propietario FROM caballos WHERE id = 3')).rows[0].propietario, 'Cambio de prueba');
    await pool.query('DROP TABLE equi_schema_migrations');
    await assert.rejects(runMigrations(pool), /revision manual/);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM caballos')).rows[0].total, 10);
    assert.equal((await pool.query("SELECT to_regclass('public.equi_schema_migrations') AS name")).rows[0].name, null);
  } finally { await pool.end(); }
});
