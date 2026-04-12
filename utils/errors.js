/**
 * utils/errors.js
 *
 * Jerarquía de errores de dominio + utilidad handleError para controllers.
 *
 * Uso en services:
 *   throw new NotFoundError('Perfil no encontrado');
 *
 * Uso en controllers:
 *   } catch (err) { handleError(res, err); }
 */

'use strict';

// ─── Clase base ───────────────────────────────────────────────────────────────

class AppError extends Error {
  /**
   * @param {string} message      - Mensaje legible
   * @param {number} status       - HTTP status code
   * @param {string} [code]       - Código interno opcional para el frontend
   * @param {object} [extra]      - Campos adicionales que se incluirán en el body de la respuesta
   */
  constructor(message, status, code, extra) {
    super(message);
    this.name   = this.constructor.name;
    this.status = status;
    this.code   = code || this.constructor.name;
    this.extra  = extra || {};
    // Mantiene stack trace limpio en V8
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Subclases por tipo HTTP ──────────────────────────────────────────────────

/** 400 — Datos inválidos o faltantes en la request */
class ValidationError extends AppError {
  constructor(message, code) { super(message, 400, code || 'VALIDATION_ERROR'); }
}

/** 401 — No autenticado */
class AuthError extends AppError {
  constructor(message = 'No autenticado') { super(message, 401, 'AUTH_ERROR'); }
}

/** 403 — Sin permisos suficientes */
class ForbiddenError extends AppError {
  constructor(message = 'No tienes permisos para realizar esta accion') {
    super(message, 403, 'FORBIDDEN');
  }
}

/** 404 — Recurso no encontrado */
class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') { super(message, 404, 'NOT_FOUND'); }
}

/** 409 — Conflicto: recurso duplicado o estado inconsistente */
class ConflictError extends AppError {
  constructor(message, code) { super(message, 409, code || 'CONFLICT'); }
}

/** 429 — Rate limit / cuota excedida */
class QuotaError extends AppError {
  constructor(message = 'Cuota del plan excedida') { super(message, 429, 'QUOTA_EXCEEDED'); }
}

/** 500 — Error interno no esperado */
class InternalError extends AppError {
  constructor(message = 'Error interno del servidor') { super(message, 500, 'INTERNAL_ERROR'); }
}

/** 502 — Error de pasarela (APIs externas, ej: Mercado Pago) */
class BadGatewayError extends AppError {
  constructor(message = 'Error en servicio externo', extra) { super(message, 502, 'BAD_GATEWAY', extra); }
}

// ─── Handler central para controllers ────────────────────────────────────────

/**
 * Envía la respuesta HTTP apropiada según el tipo de error.
 * Si no es un AppError conocido, loguea y risponde 500.
 *
 * @param {import('express').Response} res
 * @param {Error} err
 * @param {object} [logger] - instancia de logger (opcional; si no se pasa, silencia)
 *
 * @example
 *   } catch (err) {
 *     return handleError(res, err, logger);
 *   }
 */
const handleError = (res, err, logger) => {
  if (err instanceof AppError) {
    const body = { error: err.message, ...err.extra };
    if (err.code) body.code = err.code;
    return res.status(err.status).json(body);
  }

  // Error inesperado
  if (logger?.error) {
    logger.error('[handleError] Error no controlado', { error: err });
  }
  return res.status(500).json({ error: 'Error interno del servidor' });
};

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  QuotaError,
  InternalError,
  BadGatewayError,
  handleError,
};
