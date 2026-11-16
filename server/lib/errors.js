export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const unauthorized = (msg = 'Não autorizado.') => new HttpError(401, msg);
export const forbidden = (msg) => new HttpError(403, msg);
export const notFound = (msg = 'Recurso não encontrado.') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
