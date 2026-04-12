'use strict';

/**
 * utils/cache.js
 *
 * Cache L1 en memoria con TTL y request coalescing.
 *
 * Características:
 *   - TTL por entrada (auto-expiración en lectura, sin setInterval)
 *   - Request coalescing: múltiples llamadas concurrentes al mismo key
 *     comparten una única promesa en vuelo → evita trabajo duplicado
 *   - Multi-tenant seguro: cada cacheKey DEBE incluir clubId
 *   - Zero dependencias externas
 *
 * TTLs recomendados (ms):
 *   Perfil público    60_000
 *   Rankings          30_000
 *   Dashboard         15_000
 *   Torneos           30_000
 *   Estado canchas    10_000
 *
 * // TODO: reemplazar por Redis cuando la escala lo justifique
 */

// ─── Almacenamiento ───────────────────────────────────────────────────────────

/** @type {Map<string, { value: any, expiresAt: number }>} */
const store = new Map();

/** @type {Map<string, Promise<any>>} */
const pending = new Map();

// ─── API principal ────────────────────────────────────────────────────────────

/**
 * Lee una entrada si no ha expirado.
 * @param {string} key
 * @returns {any | undefined}
 */
const get = (key) => {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
};

/**
 * Almacena un valor con TTL en milisegundos.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs
 */
const set = (key, value, ttlMs) => {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

/**
 * Elimina una entrada (invalidación manual).
 * @param {string} key
 */
const del = (key) => {
  store.delete(key);
};

/**
 * Elimina todas las entradas cuya clave comience con un prefijo dado.
 * Útil para invalidar todo un "namespace" (ej: `rankings:clubX:`).
 * @param {string} prefix
 */
const delByPrefix = (prefix) => {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};

// ─── Request coalescing ───────────────────────────────────────────────────────

/**
 * Ejecuta `fn` como máximo una vez por clave aunque haya N llamadas concurrentes.
 *
 * Si hay un fetch en vuelo para `key`, las llamadas posteriores esperan
 * la misma promesa en lugar de lanzar una query duplicada.
 *
 * @template T
 * @param {string} key           - Clave de cache (multi-tenant: incluir clubId)
 * @param {number} ttlMs         - TTL del resultado en ms
 * @param {() => Promise<T>} fn  - Función que obtiene el dato
 * @returns {Promise<T>}
 */
const getOrFetch = async (key, ttlMs, fn) => {
  // 1. Hit en cache
  const cached = get(key);
  if (cached !== undefined) return cached;

  // 2. Request coalescing: si ya hay un fetch en vuelo, reusar
  if (pending.has(key)) return pending.get(key);

  // 3. Lanzar fetch y registrar la promesa
  const promise = fn()
    .then((result) => {
      set(key, result, ttlMs);
      return result;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
};

// ─── Stale-While-Revalidate ───────────────────────────────────────────────────

/**
 * Lee una entrada con metadatos de expiración.
 * @param {string} key
 * @returns {{ value: any, expired: boolean } | null}
 */
const getWithMeta = (key) => {
  const entry = store.get(key);
  if (!entry) return null;
  return { value: entry.value, expired: Date.now() > entry.expiresAt };
};

/**
 * Stale-While-Revalidate (SWR):
 * - Cache válido  → devuelve instantáneo
 * - Cache expirado → devuelve el valor viejo + dispara refresco en background
 * - Sin cache     → espera el fetch
 *
 * Garantiza que ningún burst de requests simultáneos genera trabajo duplicado.
 *
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
const getOrFetchSWR = async (key, ttlMs, fn) => {
  const meta = getWithMeta(key);

  // Cache fresco: devolver inmediatamente
  if (meta && !meta.expired) return meta.value;

  // Cache expirado: devolver stale + refrescar en background (si no hay fetch en vuelo)
  if (meta && meta.expired) {
    if (!pending.has(key)) {
      const bg = fn()
        .then((result) => {
          set(key, result, ttlMs);
          return result;
        })
        .catch(() => { /* swallow — el próximo request hará un fetch síncrono */ })
        .finally(() => pending.delete(key));
      pending.set(key, bg);
    }
    return meta.value;
  }

  // Sin cache: fetch síncrono con coalescing
  return getOrFetch(key, ttlMs, fn);
};

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** Número de entradas activas (sin contar expiradas). */
const size = () => {
  const now = Date.now();
  let count = 0;
  for (const entry of store.values()) {
    if (now <= entry.expiresAt) count++;
  }
  return count;
};

/** Expulsa entradas expiradas (llamar periódicamente si se desea, no obligatorio). */
const prune = () => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
};

// ─── TTLs estándar (ms) ───────────────────────────────────────────────────────

const TTL = Object.freeze({
  PERFIL:          60_000,
  RANKINGS:        30_000,
  DASHBOARD:       15_000,
  TORNEOS:         30_000,
  ESTADO_CANCHAS:  10_000,
});

module.exports = { get, set, del, delByPrefix, getOrFetch, getOrFetchSWR, getWithMeta, size, prune, TTL };
