'use strict';

/**
 * utils/analyticsCounters.js
 *
 * Contadores O(1) por club usando Redis INCR.
 *
 * Clave Redis: analytics:count:{clubId}:{metric}
 * TTL: 40 días (cubre ciclo de facturación mensual con margen).
 *
 * Métricas esperadas: 'torneos' | 'partidos' | 'inscripciones'
 *
 * Fail-safe: si Redis no está disponible, no lanza errores.
 */

const TTL_SECONDS = 60 * 60 * 24 * 40; // 40 días

/**
 * Incrementa un contador de analytics por club.
 * Fire-and-forget — no bloquea el caller.
 *
 * @param {string} clubId
 * @param {string} metric  - 'torneos' | 'partidos' | 'inscripciones'
 * @returns {Promise<void>}
 */
const incrementCounter = async (clubId, metric) => {
  if (!clubId || !metric) return;
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return;

    const key   = `analytics:count:${clubId}:${metric}`;
    const redis = getClient();
    await redis.incr(key);
    await redis.expire(key, TTL_SECONDS);
  } catch (_) { /* no-op */ }
};

/**
 * Lee un contador de analytics por club.
 * Devuelve 0 si Redis no está disponible o la clave no existe.
 *
 * @param {string} clubId
 * @param {string} metric
 * @returns {Promise<number>}
 */
const getCounter = async (clubId, metric) => {
  if (!clubId || !metric) return 0;
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return 0;

    const key = `analytics:count:${clubId}:${metric}`;
    const val = await getClient().get(key);
    return Number(val || 0);
  } catch (_) {
    return 0;
  }
};

module.exports = { incrementCounter, getCounter };
