import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.js';

export function authorize(request, apiKey) {
  const received = request.headers['x-api-key'];
  if (!apiKey) throw new HttpError(503, 'Operaciones de escritura deshabilitadas.');
  if (typeof received !== 'string') throw new HttpError(401, 'API key invalida o ausente.');
  const supplied = Buffer.from(received);
  const expected = Buffer.from(apiKey);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new HttpError(401, 'API key invalida o ausente.');
}

export async function readJson(request, limit = 16384) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new HttpError(415, 'Se requiere Content-Type: application/json.');
  if (Number(request.headers['content-length']) > limit) throw new HttpError(413, 'Cuerpo demasiado grande.');
  const chunks = [];
  let size = 0;
  // Evita destruir el socket al rechazar un cuerpo grande y permite responder JSON.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Cuerpo demasiado grande.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'JSON invalido o vacio.'); }
}

export function sendJson(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer'
  });
  response.end(data);
}

export function applyCors(request, response, origins) {
  const origin = request.headers.origin;
  response.setHeader('Vary', 'Origin');
  if (origin) {
    if (!origins.includes('*') && !origins.includes(origin)) throw new HttpError(403, 'Origen no permitido.');
    response.setHeader('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    response.setHeader('Access-Control-Max-Age', '600');
  }
  if (request.method === 'OPTIONS') {
    const method = request.headers['access-control-request-method'];
    if (method && !['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new HttpError(405, 'Metodo CORS no permitido.');
    const headers = (request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean);
    if (headers.some(h => !['content-type', 'x-api-key'].includes(h))) throw new HttpError(403, 'Cabecera CORS no permitida.');
  }
}
