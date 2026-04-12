'use strict';

/**
 * utils/cacheAdapter.js
 *
 * Adapter pattern para el backend de cache.
 *
 * Selección automática:
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → Redis distribuido (Upstash)
 *   - Sin variables de entorno Redis → cache en memoria (single-instance)
 *
 * La API exportada es idéntica en ambos backends:
 *   { get, set, del, delByPrefix, getOrFetch, getOrFetchSWR, getWithMeta, TTL }
 *
 * Para agregar soporte a otro backend (ej: Dragonfly, Valkey):
 *   1. Implementar utils/altCache.js con la misma API
 *   2. Añadir la condición aquí
 */

const { isAvailable } = require('./redisClient');
const memoryCache = require('./cache');

let _backend = null;

const getBackend = () => {
  if (_backend) return _backend;

  if (isAvailable()) {
    const redisCache = require('./redisCache');
    const logger = require('../services/logger');
    logger.info('cache.adapter', { backend: 'redis', msg: 'Cache distribuido Upstash activo.' });
    _backend = redisCache;
  } else {
    _backend = memoryCache;
  }

  return _backend;
};

// Proxy: delega cada llamada al backend elegido
// Permite que el backend se resuelva en runtime (no en módulo load time)
module.exports = new Proxy({}, {
  get(_target, prop) {
    return getBackend()[prop];
  },
});
