'use strict';

/**
 * utils/redisClient.js
 *
 * Cliente Redis lazy-initialized para Upstash.
 *
 * Variables de entorno requeridas (Upstash REST):
 *   UPSTASH_REDIS_REST_URL   — https://xxxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — AXxx...
 *
 * Si las variables no están presentes, getClient() devuelve null
 * y toda la capa Redis se degrada silenciosamente a in-memory.
 *
 * Por qué @upstash/redis (REST) en lugar de ioredis (TCP):
 *   Vercel serverless no mantiene conexiones TCP entre invocaciones.
 *   El cliente HTTP de Upstash es stateless → compatible con Edge y Serverless.
 */

let _client = null;
let _initAttempted = false;

/**
 * Devuelve el cliente Redis, o null si no está configurado.
 * @returns {import('@upstash/redis').Redis | null}
 */
const getClient = () => {
  if (_initAttempted) return _client;
  _initAttempted = true;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    const { Redis } = require('@upstash/redis');
    _client = new Redis({ url, token });
  } catch (e) {
    // Paquete no instalado o error de config — operar sin Redis
    _client = null;
  }

  return _client;
};

/** true si Redis está configurado y disponible */
const isAvailable = () => Boolean(getClient());

module.exports = { getClient, isAvailable };
