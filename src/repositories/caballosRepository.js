import { fields } from '../middlewares/validation.js';

const columns = 'id, nombre, raza, edad, sexo, color, disciplina, propietario, estado, fecha_registro';

export function createRepository(pool) {
  return {
    async health() { await pool.query('SELECT 1'); },
    async list() { return (await pool.query(`SELECT ${columns} FROM caballos ORDER BY id`)).rows; },
    async find(id) { return (await pool.query(`SELECT ${columns} FROM caballos WHERE id = $1`, [id])).rows[0]; },
    async filter(field, value) {
      // Identificadores SQL permitidos explicitamente; el valor siempre es parametrizado.
      if (!['raza', 'estado'].includes(field)) throw new Error('Invalid filter field');
      return (await pool.query(`SELECT ${columns} FROM caballos WHERE lower(${field}) = lower($1) ORDER BY id`, [value])).rows;
    },
    async create(horse) {
      return (await pool.query(`INSERT INTO caballos (${fields.join(', ')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${columns}`, fields.map(field => horse[field]))).rows[0];
    },
    async update(id, horse) {
      return (await pool.query(`UPDATE caballos SET ${fields.map((field, i) => `${field} = $${i + 1}`).join(', ')} WHERE id = $9 RETURNING ${columns}`, [...fields.map(field => horse[field]), id])).rows[0];
    },
    async remove(id) { return (await pool.query('DELETE FROM caballos WHERE id = $1 RETURNING id', [id])).rows[0]; }
  };
}
