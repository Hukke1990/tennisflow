'use strict';

/**
 * utils/usageTracker.js
 *
 * Tracking de uso mensual por club en Redis (Upstash).
 *
 * Claves Redis: usage:{clubId}:{metric}:{YYYY-MM}
 * TTL: 40 días (cubre el ciclo de facturación mensual con margen).
 *
 * Métricas esperadas:
 *   'partidos_mes'   — partidos finalizados en el mes
 *   'torneos_activos' — torneos creados en el mes (tracking complementario)
 *
 * Fail-safe: si Redis no está disponible, las funciones no lanzan errores.
 */

const TTL_SECONDS = 60 * 60 * 24 * 40; // 40 días

/** Devuelve el mes actual como 'YYYY-MM' */
const getMonthKey = () => new Date().toISOString().slice(0, 7);

/**
 * Incrementa el contador de uso mensual para un club y una métrica.
 * Fire-and-forget — no lanza errores.
 *
 * @param {string} clubId
 * @param {string} metric
 * @returns {Promise<void>}
 */
const incrementUsage = async (clubId, metric) => {
  if (!clubId || !metric) return;
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return;

    const key   = `usage:${clubId}:${metric}:${getMonthKey()}`;
    const redis = getClient();
    await redis.incr(key);
    await redis.expire(key, TTL_SECONDS);
  } catch (_) { /* no-op: Redis no disponible o error transitorio */ }
};

/**
 * Lee el contador de uso mensual actual para un club y una métrica.
 * Devuelve 0 si Redis no está disponible o la clave no existe.
 *
 * @param {string} clubId
 * @param {string} metric
 * @returns {Promise<number>}
 */
const getUsage = async (clubId, metric) => {
  if (!clubId || !metric) return 0;
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return 0;

    const key   = `usage:${clubId}:${metric}:${getMonthKey()}`;
    const value = await getClient().get(key);
    return parseInt(value || '0', 10);
  } catch (_) {
    return 0;
  }
};

module.exports = { incrementUsage, getUsage };
