'use strict';

/**
 * utils/redisCache.js
 *
 * Implementación de cache usando Upstash Redis (HTTP/REST).
 * API idéntica a utils/cache.js para que cacheAdapter.js pueda hacer swap.
 *
 * Diferencias vs memory cache:
 *   - get/set/del son async (Redis = red)
 *   - getOrFetch/getOrFetchSWR también async (igual que en cache.js)
 *   - delByPrefix usa SCAN — fire-and-forget async, no bloquea el caller
 *   - TTL en segundos (Redis EX) en lugar de ms
 *
 * Si el cliente Redis no está disponible, las funciones lanzan un error que
 * cacheAdapter.js captura para hacer fallback a memory cache.
 */

const { getClient } = require('./redisClient');
const logger = require('../services/logger');

// ─── Constantes compartidas ───────────────────────────────────────────────────

const TTL = Object.freeze({
  PERFIL:          60_000,
  RANKINGS:        30_000,
  DASHBOARD:       15_000,
  TORNEOS:         30_000,
  ESTADO_CANCHAS:  10_000,
});

const toSeconds = (ms) => Math.max(1, Math.ceil(ms / 1000));

// ─── In-flight deduplication (por instancia, igual que cache.js) ─────────────
// En serverless cada invocación es independiente, pero dentro de una
// invocación larga (websocket, etc.) el coalescing sigue siendo útil.

/** @type {Map<string, Promise<any>>} */
const pending = new Map();

// ─── API ─────────────────────────────────────────────────────────────────────

const get = async (key) => {
  const client = getClient();
  if (!client) return undefined;
  try {
    const raw = await client.get(key);
    return raw === null || raw === undefined ? undefined : raw;
  } catch (e) {
    logger.warn('redis.get.error', { key, error: e?.message });
    return undefined;
  }
};

const set = async (key, value, ttlMs) => {
  const client = getClient();
  if (!client) return;
  try {
    await client.set(key, value, { ex: toSeconds(ttlMs) });
  } catch (e) {
    logger.warn('redis.set.error', { key, error: e?.message });
  }
};

const del = async (key) => {
  const client = getClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch (e) {
    logger.warn('redis.del.error', { key, error: e?.message });
  }
};

/**
 * Elimina todas las claves que comienzan con `prefix` usando SCAN.
 * Fire-and-forget: no bloquea el caller.
 * @param {string} prefix
 */
const delByPrefix = (prefix) => {
  const client = getClient();
  if (!client) return;

  // SCAN async — no awaitable intencionalmente (invalidación eventual)
  (async () => {
    try {
      let cursor = 0;
      do {
        const [nextCursor, keys] = await client.scan(cursor, {
          match: `${prefix}*`,
          count: 100,
        });
        cursor = Number(nextCursor);
        if (keys && keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== 0);
    } catch (e) {
      logger.warn('redis.delByPrefix.error', { prefix, error: e?.message });
    }
  })();
};

/**
 * Lee con metadatos de expiración.
 * Redis no expone TTL restante en GET, así que usa un campo auxiliar opcional.
 * Para SWR simplificado: si el valor existe, se considera "fresco" (Redis TTL activo).
 * Cuando Redis expira la clave, simplemente desaparece → null ≡ expirado.
 *
 * Para una expiración "blanda" (servir stale), se guarda también la clave con
 * sufijo ":stale" con TTL extendido (×2) que sigue disponible tras expirar la principal.
 *
 * @param {string} key
 * @returns {Promise<{ value: any, expired: boolean } | null>}
 */
const getWithMeta = async (key) => {
  const client = getClient();
  if (!client) return null;
  try {
    // Intentar clave fresca primero; luego stale
    const fresh = await client.get(key);
    if (fresh !== null && fresh !== undefined) {
      return { value: fresh, expired: false };
    }
    const stale = await client.get(`${key}:stale`);
    if (stale !== null && stale !== undefined) {
      return { value: stale, expired: true };
    }
    return null;
  } catch (e) {
    logger.warn('redis.getWithMeta.error', { key, error: e?.message });
    return null;
  }
};

/**
 * Almacena el valor en dos claves:
 *   - key          → TTL normal (para hits frescos)
 *   - key:stale    → TTL × 2 (buffer para SWR background refresh)
 */
const setWithStale = async (key, value, ttlMs) => {
  const client = getClient();
  if (!client) return;
  try {
    const ex      = toSeconds(ttlMs);
    const exStale = ex * 2;
    await Promise.all([
      client.set(key, value, { ex }),
      client.set(`${key}:stale`, value, { ex: exStale }),
    ]);
  } catch (e) {
    logger.warn('redis.setWithStale.error', { key, error: e?.message });
  }
};

// ─── Request coalescing + SWR ─────────────────────────────────────────────────

const getOrFetch = async (key, ttlMs, fn) => {
  const cached = await get(key);
  if (cached !== undefined) return cached;

  if (pending.has(key)) return pending.get(key);

  const promise = fn()
    .then((result) => {
      set(key, result, ttlMs);
      return result;
    })
    .finally(() => pending.delete(key));

  pending.set(key, promise);
  return promise;
};

const getOrFetchSWR = async (key, ttlMs, fn) => {
  const meta = await getWithMeta(key);

  // Cache fresco
  if (meta && !meta.expired) return meta.value;

  // Cache expirado (stale disponible) → devolver stale + refrescar en background
  if (meta && meta.expired) {
    if (!pending.has(key)) {
      const bg = fn()
        .then((result) => {
          setWithStale(key, result, ttlMs);
          return result;
        })
        .catch(() => {})
        .finally(() => pending.delete(key));
      pending.set(key, bg);
    }
    return meta.value;
  }

  // Sin cache → fetch síncrono con coalescing
  return getOrFetch(key, ttlMs, fn);
};

// ─── Increment (métricas distribuidas) ───────────────────────────────────────

/**
 * Incrementa un contador en Redis (para métricas globales entre instancias).
 * Fire-and-forget — no await.
 * @param {string} metricName
 */
const incrementMetric = (metricName) => {
  const client = getClient();
  if (!client) return;
  client.incr(`metric:${metricName}`).catch(() => {});
};

/**
 * Obtiene todos los contadores de métricas almacenados en Redis.
 * @returns {Promise<Record<string, number>>}
 */
const getMetrics = async () => {
  const client = getClient();
  if (!client) return {};
  try {
    const keys = [];
    let cursor = 0;
    do {
      const [next, batch] = await client.scan(cursor, { match: 'metric:*', count: 100 });
      cursor = Number(next);
      keys.push(...(batch || []));
    } while (cursor !== 0);

    if (!keys.length) return {};
    const values = await client.mget(...keys);
    const result = {};
    keys.forEach((k, i) => {
      result[k.replace('metric:', '')] = Number(values[i] || 0);
    });
    return result;
  } catch (e) {
    logger.warn('redis.getMetrics.error', { error: e?.message });
    return {};
  }
};

module.exports = {
  get, set, del, delByPrefix,
  getWithMeta, getOrFetch, getOrFetchSWR,
  incrementMetric, getMetrics,
  TTL,
};
