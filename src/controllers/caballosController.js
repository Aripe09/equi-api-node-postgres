import { HttpError } from '../middlewares/errors.js';
import { authorize, readJson } from '../middlewares/http.js';
import { validateHorse } from '../middlewares/validation.js';

export async function handleRoute(request, response, route, repository, apiKey) {
  const method = request.method;
  if (!route.methods.includes(method)) {
    response.setHeader('Allow', [...route.methods, 'OPTIONS'].join(', '));
    throw new HttpError(405, 'Metodo no permitido.');
  }
  if (['POST', 'PUT', 'DELETE'].includes(method)) authorize(request, apiKey);
  if (route.kind === 'health') {
    await repository.health();
    return [200, { status: 'ok', database: 'ok' }];
  }
  if (route.kind === 'filter') return [200, await repository.filter(route.field, route.value)];
  if (route.kind === 'collection' && method === 'GET') return [200, await repository.list()];
  if (method === 'POST') {
    const horse = await repository.create(validateHorse(await readJson(request)));
    response.setHeader('Location', `/api/caballos/${horse.id}`);
    return [201, horse];
  }
  let horse;
  if (method === 'GET') horse = await repository.find(route.id);
  if (method === 'PUT') horse = await repository.update(route.id, validateHorse(await readJson(request)));
  if (method === 'DELETE') horse = await repository.remove(route.id);
  if (!horse) throw new HttpError(404, 'Caballo no encontrado.');
  return [200, method === 'DELETE' ? { message: 'Caballo eliminado.', id: horse.id } : horse];
}
