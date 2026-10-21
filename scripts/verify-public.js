import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = new URL(process.env.TEST_BASE_URL || 'https://invalid.local');
if (url.protocol !== 'https:' || !url.hostname.endsWith('.onrender.com') || url.username || url.password) throw new Error('Indica TEST_BASE_URL con la URL HTTPS real de Render');
const base = url.origin;
const writes = process.env.TEST_WRITES === 'true';
if (writes && !process.env.API_KEY) throw new Error('Las pruebas de escritura requieren API_KEY remota');
async function call(path, method = 'GET', body, expected = 200, withKey = true) {
  const response = await fetch(base + path, {
    method, signal: AbortSignal.timeout(120000), redirect: 'error',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(withKey && writes ? { 'x-api-key': process.env.API_KEY } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.equal(response.status, expected, `${method} ${path}`);
  assert.match(response.headers.get('content-type'), /application\/json/);
  return response.json();
}
assert.equal((await call('/api/health')).database, 'ok');
const before = await call('/api/caballos');
assert.ok(before.length >= 10);
assert.equal((await call('/api/caballos/3')).id, 3);
await call('/api/caballos/estado/Activo');
await call('/api/caballos/raza/' + encodeURIComponent('Árabe'));
if (writes) {
  const marker = `EquiAPI-test-${randomUUID()}`;
  const payload = { nombre: marker, raza: 'Árabe', edad: 4, sexo: 'Hembra', estado: 'Activo' };
  try {
    await call('/api/caballos', 'POST', payload, 401, false);
    const created = await call('/api/caballos', 'POST', payload, 201);
    await call(`/api/caballos/${created.id}`, 'PUT', undefined, 401, false);
    await call(`/api/caballos/${created.id}`, 'DELETE', undefined, 401, false);
    const updated = await call(`/api/caballos/${created.id}`, 'PUT', { ...payload, edad: 5 });
    assert.equal(updated.edad, 5);
    assert.equal((await call(`/api/caballos/${created.id}`)).edad, 5);
    await call(`/api/caballos/${created.id}`, 'DELETE');
    await call(`/api/caballos/${created.id}`, 'GET', undefined, 404);
  } finally {
    const remaining = await call('/api/caballos');
    for (const row of remaining.filter(item => item.nombre === marker)) await call(`/api/caballos/${row.id}`, 'DELETE');
  }
  assert.deepEqual(await call('/api/caballos'), before, 'Los registros originales deben permanecer intactos');
}
console.log(JSON.stringify({ status: 'ok', base, reads: true, writes, originalRecords: before.length }));
