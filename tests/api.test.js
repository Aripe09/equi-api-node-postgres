import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createRepository } from '../src/repositories/caballosRepository.js';

const key = 'test-key-with-at-least-32-bytes-0001';
const sample = { nombre: 'Prueba', raza: 'Árabe', edad: 5, sexo: 'Macho', estado: 'Activo' };

async function fixture(t, overrides = {}) {
  let next = 1;
  const records = new Map();
  const repository = {
    health: async () => {},
    list: async () => [...records.values()],
    find: async id => records.get(id),
    filter: async (field, value) => [...records.values()].filter(h => h[field].toLowerCase() === value.toLowerCase()),
    create: async horse => { const row = { id: next++, ...horse }; records.set(row.id, row); return row; },
    update: async (id, horse) => { if (!records.has(id)) return undefined; const row = { id, ...horse }; records.set(id, row); return row; },
    remove: async id => { const horse = records.get(id); records.delete(id); return horse; },
    ...overrides
  };
  const server = createApp({ repository, apiKey: key, corsOrigins: ['http://allowed.test'] });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = 'GET', body, headers = {}) => fetch(base + path, {
    method, headers: { 'x-api-key': key, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { call, base, records };
}

test('HTTP nativo: CRUD, barras finales, filtros, inexistentes y JSON', async t => {
  const { call } = await fixture(t);
  assert.equal((await call('/api/health')).status, 200);
  assert.deepEqual(await (await call('/api/caballos/')).json(), []);
  const created = await call('/api/caballos/', 'POST', sample);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), '/api/caballos/1');
  assert.match(created.headers.get('content-type'), /application\/json/);
  const horse = await created.json();
  assert.equal(horse.color, null);
  assert.equal((await (await call('/api/caballos/1/')).json()).nombre, 'Prueba');
  assert.equal((await (await call('/api/caballos/raza/' + encodeURIComponent('árabe'))).json()).length, 1);
  assert.equal((await (await call('/api/caballos/estado/Activo/')).json()).length, 1);
  assert.equal((await call('/api/caballos/1', 'PUT', { ...sample, nombre: 'Actualizado' })).status, 200);
  assert.equal((await (await call('/api/caballos/1')).json()).nombre, 'Actualizado');
  assert.equal((await call('/api/caballos/1', 'DELETE')).status, 200);
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await call('/api/caballos/1', method, method === 'PUT' ? sample : undefined)).status, 404);
});

test('rechaza cuerpos invalidos, campos desconocidos y IDs invalidos', async t => {
  const { call, base } = await fixture(t);
  for (const body of [null, [], {}, { ...sample, edad: -1 }, { ...sample, edad: '5' }, { ...sample, sexo: 'Otro' }, { ...sample, estado: null }, { ...sample, nombre: ' ' }, { ...sample, id: 1 }, { ...sample, color: '' }]) {
    assert.equal((await call('/api/caballos', 'POST', body)).status, 400);
  }
  for (const path of ['/api/caballos/0', '/api/caballos/-1', '/api/caballos/2147483648', '/api/caballos/1%20OR%201=1', '/api/caballos/raza/', '/api/caballos/estado/', '/api/caballos/%ZZ']) {
    assert.equal((await call(path)).status, 400, path);
  }
  assert.equal((await fetch(base + '/api/caballos', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await call('/api/caballos', 'POST', sample, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call('/api/caballos', 'POST', { ...sample, nombre: 'x'.repeat(17000) })).status, 413);
});

test('API key protege cada operacion de escritura y CORS valida origen/preflight', async t => {
  const { call, base } = await fixture(t);
  for (const [method, path] of [['POST', '/api/caballos'], ['PUT', '/api/caballos/1'], ['DELETE', '/api/caballos/1']]) {
    assert.equal((await call(path, method, undefined, { 'x-api-key': '' })).status, 401);
    assert.equal((await fetch(base + path, { method })).status, 401);
  }
  const allowed = await call('/api/caballos', 'GET', undefined, { origin: 'http://allowed.test' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://allowed.test');
  assert.equal((await call('/api/caballos', 'GET', undefined, { origin: 'http://evil.test' })).status, 403);
  const preflight = await call('/api/caballos', 'OPTIONS', undefined, { origin: 'http://allowed.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-api-key, content-type' });
  assert.equal(preflight.status, 200);
  assert.equal((await call('/api/caballos', 'OPTIONS', undefined, { origin: 'http://allowed.test', 'access-control-request-headers': 'authorization' })).status, 403);
  assert.equal((await call('/api/caballos', 'PATCH')).status, 405);
  assert.equal((await call('/unknown')).status, 404);
});

test('fallo de PostgreSQL responde 503 sin filtrar detalles internos', async t => {
  const { call } = await fixture(t, { health: async () => { throw new Error('password=secret SQL internal'); } });
  const response = await call('/api/health');
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|password|SQL/);
});

test('repositorio parametriza IDs, filtros y valores de escritura', async () => {
  const calls = [];
  const repository = createRepository({ query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } });
  const injection = "'; DROP TABLE caballos; --";
  await repository.filter('raza', injection);
  await repository.find(6);
  await repository.create({ ...sample, nombre: injection });
  await repository.update(6, sample);
  await repository.remove(6);
  assert.ok(calls.every(call => !call.sql.includes(injection)));
  assert.equal(calls[0].values[0], injection);
  assert.deepEqual(calls[1].values, [6]);
  assert.equal(calls[2].values[0], injection);
  assert.equal(calls[3].values.at(-1), 6);
  assert.deepEqual(calls[4].values, [6]);
  await assert.rejects(repository.filter('id; DROP TABLE caballos', injection));
});
