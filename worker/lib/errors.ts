import type { Context } from 'hono'

/**
 * Cada invariante del servidor responde 409 con un mensaje en español que dice
 * qué hacer, no sólo qué falló.
 */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 423 | 429 | 500,
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (message: string, code = 'bad_request') => new AppError(400, message, code)
export const unauthorized = (message = 'Inicia sesión otra vez.', code = 'unauthorized') => new AppError(401, message, code)
export const forbidden = (message: string, code = 'forbidden') => new AppError(403, message, code)
export const notFound = (message: string, code = 'not_found') => new AppError(404, message, code)
/** Invariante del servidor: la operación es válida en forma pero no en el estado actual. */
export const conflict = (message: string, code = 'conflict') => new AppError(409, message, code)
export const tooLarge = (message: string, code = 'too_large') => new AppError(413, message, code)
export const unsupportedMedia = (message: string, code = 'unsupported_media') => new AppError(415, message, code)
export const locked = (message: string, code = 'locked') => new AppError(423, message, code)

export function errorResponse(c: Context, err: unknown): Response {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status)
  }
  console.error('error no controlado', err)
  return c.json({ error: 'Algo falló de este lado. Vuelve a intentar; si sigue igual, avísale a la dueña.', code: 'internal' }, 500)
}
