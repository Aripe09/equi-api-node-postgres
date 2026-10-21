import { HttpError } from '../middlewares/errors.js';
import { parseId } from '../middlewares/validation.js';

export function matchRoute(rawUrl) {
  let parts;
  try {
    const url = new URL(rawUrl, 'http://api');
    const path = url.pathname.replace(/\/$/, '');
    parts = path.split('/').map(decodeURIComponent);
  } catch { throw new HttpError(400, 'URL invalida.'); }
  if (parts.length === 3 && parts[1] === 'api' && parts[2] === 'health') return { kind: 'health', methods: ['GET'] };
  if (parts[1] !== 'api' || parts[2] !== 'caballos') throw new HttpError(404, 'Ruta no encontrada.');
  if (parts.length === 3) return { kind: 'collection', methods: ['GET', 'POST'] };
  if (parts[3] === 'raza' || parts[3] === 'estado') {
    if (parts.length !== 5 || !parts[4].trim() || [...parts[4]].length > 100) throw new HttpError(400, 'Debes indicar el valor del filtro en la URL.');
    return { kind: 'filter', field: parts[3], value: parts[4].trim(), methods: ['GET'] };
  }
  if (parts.length === 4) return { kind: 'item', id: parseId(parts[3]), methods: ['GET', 'PUT', 'DELETE'] };
  throw new HttpError(404, 'Ruta no encontrada.');
}
