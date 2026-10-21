import { HttpError } from './errors.js';

export const fields = ['nombre', 'raza', 'edad', 'sexo', 'color', 'disciplina', 'propietario', 'estado'];
const limits = { nombre: 100, raza: 100, sexo: 20, color: 100, disciplina: 100, propietario: 150, estado: 30 };
const optional = new Set(['color', 'disciplina', 'propietario']);

export function validateHorse(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'El cuerpo debe ser un objeto JSON.');
  const errors = [];
  const output = {};
  for (const key of Object.keys(input)) if (!fields.includes(key)) errors.push(`Campo no permitido: ${key}`);
  for (const key of fields) {
    const value = input[key];
    if (key === 'edad') {
      if (!Number.isInteger(value) || value < 0 || value > 60) errors.push('edad debe ser un entero entre 0 y 60.');
      else output.edad = value;
      continue;
    }
    if (optional.has(key) && (value === undefined || value === null)) { output[key] = null; continue; }
    if (key === 'estado' && value === undefined) { output.estado = 'Activo'; continue; }
    if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > limits[key]) {
      errors.push(`${key} debe ser texto no vacio de hasta ${limits[key]} caracteres.`);
    } else output[key] = value.trim();
  }
  if (output.sexo && !['Macho', 'Hembra'].includes(output.sexo)) errors.push('sexo debe ser Macho o Hembra.');
  if (output.estado && !['Activo', 'Inactivo', 'En tratamiento', 'Retirado'].includes(output.estado)) errors.push('estado no permitido.');
  if (errors.length) throw new HttpError(400, 'Datos invalidos.', errors);
  return output;
}

export function parseId(value) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) throw new HttpError(400, 'ID invalido.');
  return Number(value);
}
