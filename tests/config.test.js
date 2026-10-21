import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseOptions, migrationsEnabled } from '../src/config/connectionOptions.js';

test('conexion local conserva postgres:5432, equi_db y credenciales PG sin TLS', () => {
  const config = databaseOptions({ PGUSER: 'local-user', PGPASSWORD: 'local-test-only' });
  assert.equal(config.host, 'postgres');
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'equi_db');
  assert.equal(config.user, 'local-user');
  assert.equal(config.ssl, false);
  assert.equal(config.connectionString, undefined);
  assert.equal(migrationsEnabled({}), false);
  assert.throws(() => migrationsEnabled({ RUN_MIGRATIONS: 'true' }));
});

test('DATABASE_URL tiene precedencia y TLS verifica certificados por defecto', () => {
  const config = databaseOptions({ DATABASE_URL: 'postgresql://remote.example/equi_db', PGHOST: 'postgres' });
  assert.equal(config.host, undefined);
  assert.equal(new URL(config.connectionString).hostname, 'remote.example');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(migrationsEnabled({ DATABASE_URL: 'postgresql://remote.example/equi_db', RUN_MIGRATIONS: 'true' }), true);
});

test('TLS require explicito para Render interno no afecta las conexiones locales', () => {
  const config = databaseOptions({ DATABASE_URL: 'postgresql://remote.example/equi_db?sslmode=require' });
  assert.equal(config.ssl.rejectUnauthorized, false);
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
  assert.equal(databaseOptions({ DATABASE_SSL_MODE: 'require' }).ssl, false);
  const verified = databaseOptions({ DATABASE_URL: 'postgresql://remote.example/equi_db?sslmode=require', DATABASE_SSL_MODE: 'verify-full', DATABASE_SSL_CA: 'line1\\nline2' });
  assert.equal(verified.ssl.rejectUnauthorized, true);
  assert.equal(verified.ssl.ca, 'line1\nline2');
  for (const url of ['bad url', 'https://example.com/db', 'postgresql://example.com', 'postgresql://example.com/db?sslmode=disable']) assert.throws(() => databaseOptions({ DATABASE_URL: url }));
  assert.throws(() => migrationsEnabled({ RUN_MIGRATIONS: 'yes' }));
});
