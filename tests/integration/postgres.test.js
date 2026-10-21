import test from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../../src/config/database.js';

test('API real y PostgreSQL: CRUD y limpieza solo del registro creado', async () => {
  const pool = createPool();
  const base = process.env.TEST_BASE_URL || 'http://api:3000';
  const name = `EquiAPI-test-${crypto.randomUUID()}`;
  const payload = { nombre: name, raza: 'Árabe', edad: 4, sexo: 'Hembra', estado: 'Activo' };
  const call = (path, method = 'GET', body) => fetch(base + path, { method, headers: { 'x-api-key': process.env.API_KEY, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let id;
  let before;
  try {
    before = (await pool.query('SELECT * FROM caballos ORDER BY id')).rows;
    assert.equal((await call('/api/health')).status, 200);
    assert.equal((await call('/api/caballos/6')).status, 200);
    const created = await call('/api/caballos', 'POST', payload);
    assert.equal(created.status, 201);
    const horse = await created.json();
    id = horse.id;
    assert.equal((await pool.query('SELECT nombre FROM caballos WHERE id=$1', [id])).rows[0].nombre, name);
    assert.equal((await call(`/api/caballos/${id}`, 'PUT', { ...payload, edad: 5 })).status, 200);
    assert.equal((await pool.query('SELECT edad FROM caballos WHERE id=$1', [id])).rows[0].edad, 5);
    const filtered = await (await call('/api/caballos/raza/' + encodeURIComponent('Árabe'))).json();
    assert.ok(filtered.some(row => row.id === id));
    assert.equal((await call(`/api/caballos/${id}`, 'DELETE')).status, 200);
    assert.equal((await pool.query('SELECT id FROM caballos WHERE id=$1', [id])).rowCount, 0);
    assert.equal((await call(`/api/caballos/${id}`)).status, 404);
  } finally {
    try {
      // La marca unica permite limpiar aunque se perdiera la respuesta del POST.
      if (before) {
        await pool.query('DELETE FROM caballos WHERE nombre=$1', [name]);
        const after = (await pool.query('SELECT * FROM caballos ORDER BY id')).rows;
        assert.deepEqual(after, before, 'Los registros originales deben conservarse intactos.');
      }
    } finally { await pool.end(); }
  }
});
