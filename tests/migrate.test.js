import test from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations, loadMigrations } from '../src/database/migrate.js';

function fakePool({ exists = {}, applied = [], failSql = false } = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('to_regclass')) return { rows: [{ migrations: exists.migrations || null, caballos: exists.caballos || null }] };
      if (sql === 'SELECT version, checksum FROM equi_schema_migrations') return { rows: applied };
      if (sql === 'SQL MIGRATION' && failSql) throw new Error('Injected SQL failure');
      return { rows: [] };
    },
    release() { released = true; }
  };
  return { calls, get released() { return released; }, connect: async () => client };
}
const migration = { version: '001', checksum: 'test-checksum', sql: 'SQL MIGRATION' };

test('migraciones atomicas, bloqueo y version registrada', async () => {
  const pool = fakePool();
  assert.deepEqual(await runMigrations(pool, [migration]), ['001']);
  assert.ok(pool.calls.some(call => call.sql.includes('pg_advisory_xact_lock')));
  assert.deepEqual(pool.calls.find(call => call.sql.startsWith('INSERT')).values, ['001', 'test-checksum']);
  assert.equal(pool.calls.at(-1).sql, 'COMMIT');
  assert.equal(pool.released, true);
});

test('version aplicada no vuelve a ejecutar SQL ni semillas', async () => {
  const pool = fakePool({ exists: { migrations: 'equi_schema_migrations', caballos: 'caballos' }, applied: [migration] });
  assert.deepEqual(await runMigrations(pool, [migration]), []);
  assert.ok(!pool.calls.some(call => call.sql === migration.sql));
});

test('rechaza tabla existente sin historial y revierte sin tocarla', async () => {
  const pool = fakePool({ exists: { caballos: 'caballos' } });
  await assert.rejects(runMigrations(pool, [migration]), /revision manual/);
  assert.ok(!pool.calls.some(call => call.sql.startsWith('CREATE') || call.sql === migration.sql));
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(pool.released, true);
});

test('checksum incompatible y SQL fallido revierten y liberan conexion', async () => {
  for (const pool of [fakePool({ applied: [{ version: '001', checksum: 'changed' }] }), fakePool({ failSql: true })]) {
    await assert.rejects(runMigrations(pool, [migration]));
    assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(pool.released, true);
  }
});

test('archivo inicial tiene 10 semillas y no contiene control de transaccion', async () => {
  const files = await loadMigrations();
  assert.equal(files.length, 1);
  assert.equal(files[0].checksum.length, 64);
  assert.doesNotMatch(files[0].sql, /^\s*(BEGIN|COMMIT);/m);
  assert.equal((files[0].sql.match(/^\('/gm) || []).length, 10);
});
