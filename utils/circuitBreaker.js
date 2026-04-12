'use strict';

/**
 * utils/circuitBreaker.js
 *
 * Circuit breaker simple para servicios externos (Mercado Pago, etc.).
 *
 * Estados:
 *   CLOSED  — operación normal, las llamadas pasan
 *   OPEN    — fallo detectado, las llamadas se rechazan sin intentar el servicio
 *   HALF    — período de prueba, permite 1 llamada para ver si el servicio recuperó
 *
 * Parámetros configurables por instancia:
 *   @param {number} opts.threshold   — Nº de fallos consecutivos para abrir el circuito (default: 5)
 *   @param {number} opts.timeout     — ms que el circuito permanece OPEN antes de probar HALF (default: 30_000)
 *   @param {string} opts.name        — Nombre del servicio para logging
 *
 * Uso:
 *   const cb = createCircuitBreaker({ name: 'mercadopago', threshold: 5, timeout: 30_000 });
 *   const result = await cb.execute(() => fetchMp('/preapproval/xxx', token));
 */

const logger = require('../services/logger');

const STATE = Object.freeze({ CLOSED: 'CLOSED', OPEN: 'OPEN', HALF: 'HALF' });

/**
 * Crea una instancia de circuit breaker.
 * @param {{ name?: string, threshold?: number, timeout?: number }} opts
 */
const createCircuitBreaker = (opts = {}) => {
  const name      = opts.name      || 'external';
  const threshold = opts.threshold || 5;
  const timeout   = opts.timeout   || 30_000;

  let state      = STATE.CLOSED;
  let failures   = 0;
  let openedAt   = 0;
  let halfProbe  = false;   // ya hay una prueba en vuelo en estado HALF

  const trip = () => {
    state    = STATE.OPEN;
    openedAt = Date.now();
    logger.warn('circuit_breaker.open', { service: name, failures });
  };

  const reset = () => {
    state    = STATE.CLOSED;
    failures = 0;
    halfProbe = false;
    logger.info('circuit_breaker.closed', { service: name });
  };

  const tryHalf = () => {
    state     = STATE.HALF;
    halfProbe = false;
    logger.info('circuit_breaker.half', { service: name });
  };

  /**
   * Ejecuta `fn` respetando el estado del circuito.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  const execute = async (fn) => {
    // Estado OPEN: ¿hay que probar HALF?
    if (state === STATE.OPEN) {
      if (Date.now() - openedAt >= timeout) {
        tryHalf();
      } else {
        throw new Error(`[CircuitBreaker:${name}] Circuito abierto. Servicio no disponible temporalmente.`);
      }
    }

    // Estado HALF: solo permite 1 llamada de prueba a la vez
    if (state === STATE.HALF) {
      if (halfProbe) {
        // Ya hay otra llamada de prueba en vuelo → rechazar las demás
        throw new Error(`[CircuitBreaker:${name}] Circuito en prueba. Intenta en breve.`);
      }
      halfProbe = true;
    }

    try {
      const result = await fn();
      // Éxito — reiniciar circuito si estaba en HALF
      if (state === STATE.HALF) reset();
      else failures = 0;   // reset silencioso en CLOSED
      return result;
    } catch (err) {
      failures += 1;
      halfProbe = false;

      if (state === STATE.HALF || failures >= threshold) {
        trip();
      } else {
        logger.warn('circuit_breaker.failure', { service: name, failures, threshold });
      }
      throw err;
    }
  };

  /** Devuelve el estado actual (para health checks / métricas). */
  const status = () => ({ name, state, failures, openedAt: openedAt || null });

  return { execute, status, reset };
};

module.exports = { createCircuitBreaker, STATE };
