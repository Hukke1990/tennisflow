'use strict';

/**
 * utils/rateLimiterGlobal.js
 *
 * Rate limiting global con Upstash Ratelimit.
 *
 * Cuando Redis está disponible (UPSTASH_REDIS_REST_URL + TOKEN):
 *   → Sliding window distribuido, comparte límites entre instancias
 *   → Keyed por IP o por userId autenticado (FASE 4)
 *
 * Cuando Redis NO está disponible:
 *   → Devuelve null — el caller usa express-rate-limit local como fallback
 *
 * Variables de entorno:
 *   UPSTASH_REDIS_REST_URL      — requerida para activar
 *   UPSTASH_REDIS_REST_TOKEN    — requerida para activar
 *   RATE_LIMIT_GLOBAL_MAX       — requests por ventana (default: 300)
 *   RATE_LIMIT_GLOBAL_WINDOW    — ventana en segundos (default: 900 = 15min)
 *
 * Uso en index.js:
 *   const globalRateLimiterMiddleware = require('./utils/rateLimiterGlobal');
 *   if (globalRateLimiterMiddleware) app.use(globalRateLimiterMiddleware);
 */

const { isAvailable, getClient } = require('./redisClient');
const logger = require('../services/logger');

let _middleware = null;
let _initDone = false;

/**
 * Devuelve el middleware Express de rate limiting global, o null si no hay Redis.
 * @returns {import('express').RequestHandler | null}
 */
const getRateLimiterMiddleware = () => {
  if (_initDone) return _middleware;
  _initDone = true;

  if (!isAvailable()) {
    logger.info('rate_limit.adapter', { backend: 'local', msg: 'Sin Redis — usando express-rate-limit local.' });
    return null;
  }

  try {
    const { Ratelimit } = require('@upstash/ratelimit');
    const { Redis }     = require('@upstash/redis');

    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const maxRequests  = Number(process.env.RATE_LIMIT_GLOBAL_MAX    || 300);
    const windowSecs   = Number(process.env.RATE_LIMIT_GLOBAL_WINDOW || 900);   // 15 min

    const limiter = new Ratelimit({
      redis,
      limiter:   Ratelimit.slidingWindow(maxRequests, `${windowSecs} s`),
      analytics: true,    // Upstash analytics dashboard
      prefix:    'tf:rl', // namespace
    });

    logger.info('rate_limit.adapter', {
      backend: 'upstash',
      max:     maxRequests,
      window:  `${windowSecs}s`,
      msg:     'Rate limiting global distribuido activo.',
    });

    _middleware = async (req, res, next) => {
      try {
        // FASE 4: keyed por userId autenticado o IP
        // req.authUser puede no estar disponible aquí (rate limit antes de auth)
        // → usar IP como clave primaria; se puede refinar por ruta si se quiere
        const identifier = req.ip || 'unknown';

        const { success, limit, remaining, reset } = await limiter.limit(identifier);

        // Exponer headers estándar
        res.setHeader('X-RateLimit-Limit',     limit);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset',     reset);

        if (!success) {
          logger.warn('rate_limit.exceeded', {
            ip:        identifier,
            path:      req.path,
            method:    req.method,
            remaining: 0,
          });
          return res.status(429).json({
            error:   'Demasiadas solicitudes. Intenta más tarde.',
            retryAt: new Date(reset).toISOString(),
          });
        }

        return next();
      } catch (e) {
        // Si Redis falla → fail open (no bloquear tráfico)
        logger.warn('rate_limit.error', { error: e?.message });
        return next();
      }
    };

    return _middleware;
  } catch (e) {
    logger.warn('rate_limit.init_error', { error: e?.message });
    return null;
  }
};

module.exports = getRateLimiterMiddleware;
