import { createServer } from 'node:http';
import { applyCors, sendJson } from './middlewares/http.js';
import { errorResponse } from './middlewares/errors.js';
import { matchRoute } from './routes/caballosRoutes.js';
import { handleRoute } from './controllers/caballosController.js';

export function createApp({ repository, apiKey, corsOrigins = [] }) {
  const server = createServer({ maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000, keepAliveTimeout: 5000 }, async (request, response) => {
    try {
      applyCors(request, response, corsOrigins);
      const route = matchRoute(request.url);
      if (request.method === 'OPTIONS') {
        response.setHeader('Allow', [...route.methods, 'OPTIONS'].join(', '));
        sendJson(response, 200, { methods: [...route.methods, 'OPTIONS'] });
      } else {
        const [status, body] = await handleRoute(request, response, route, repository, apiKey);
        sendJson(response, status, body);
      }
    } catch (error) {
      const { status, body } = errorResponse(error);
      if (status >= 500) console.error(JSON.stringify({ event: 'request_error', code: error.code || 'UNAVAILABLE' }));
      // Cierra conexiones cuyo cuerpo no se consumio (errores de auth/tamano/formato).
      if (!request.readableEnded) response.setHeader('Connection', 'close');
      if (!response.headersSent) sendJson(response, status, body);
    }
  });
  server.maxRequestsPerSocket = 100;
  return server;
}
