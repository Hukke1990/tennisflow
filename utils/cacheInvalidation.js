'use strict';

/**
 * utils/cacheInvalidation.js
 *
 * Invalidación centralizada de cache por club.
 *
 * Regla: cualquier escritura que modifique datos de un club
 * llama a invalidateClub(clubId) — no scatters manuales en cada servicio.
 *
 * Namespaces gestionados:
 *   dashboard:{clubId}:*
 *   rankings:{clubId}:*
 *   torneos:all:{clubId}
 *   torneos:disponibles:{clubId}
 */

const cache = require('./cache');

/**
 * Invalida todos los namespaces de cache para un club dado.
 * @param {string} clubId
 */
const invalidateClub = (clubId) => {
  if (!clubId) return;
  cache.delByPrefix(`dashboard:${clubId}:`);
  cache.delByPrefix(`rankings:${clubId}:`);
  cache.delByPrefix(`torneos:all:${clubId}`);
  cache.delByPrefix(`torneos:disponibles:${clubId}`);
};

module.exports = { invalidateClub };
