export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.message, ...(error.details ? { details: error.details } : {}) } };
  }
  if (['23514', '23502', '22001', '22P02', '22003'].includes(error.code)) {
    return { status: 400, body: { error: 'Los datos no cumplen las restricciones de la base de datos.' } };
  }
  if (error.code === '23505') return { status: 409, body: { error: 'El registro ya existe.' } };
  // No exponer SQL, credenciales ni mensajes internos al cliente.
  return { status: 503, body: { error: 'Servicio de datos temporalmente no disponible.' } };
}
