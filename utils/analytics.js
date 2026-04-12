'use strict';

/**
 * utils/analytics.js
 *
 * Sistema de tracking de eventos de negocio en Redis.
 *
 * Clave Redis: analytics:events  (lista LIFO, máx 10 000 eventos)
 * TTL:  no se aplica a la lista — se controla por ltrim.
 *
 * Fail-safe: si Redis no está disponible, no lanza errores.
 *
 * Eventos esperados:
 *   torneo_creado | jugador_inscripto | partido_jugado | dashboard_view
 *
 * @example
 *   await trackEvent('torneo_creado', { club_id: 'xxx', user_id: 'yyy' });
 */

const MAX_EVENTS      = 10_000;
const MAX_CLUB_EVENTS = 1_000;

/**
 * Registra un evento en la lista Redis analytics:events (global)
 * y en analytics:club:{club_id} (por club — O(1) lookup).
 * Fire-and-forget — no bloquea el caller.
 *
 * @param {string} event  - Nombre del evento
 * @param {object} [data] - Datos adicionales (club_id, user_id, etc.)
 * @returns {Promise<void>}
 */
const trackEvent = async (event, data = {}) => {
  if (!event) return;
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return;

    const payload = JSON.stringify({ event, ...data, ts: Date.now() });
    const redis   = getClient();

    // Lista global: ventana rolling de MAX_EVENTS
    await redis.lpush('analytics:events', payload);
    await redis.ltrim('analytics:events', 0, MAX_EVENTS - 1);

    // Lista por club: ventana rolling de MAX_CLUB_EVENTS (O(1) per-club reads)
    if (data.club_id) {
      const clubKey = `analytics:club:${data.club_id}`;
      await redis.lpush(clubKey, payload);
      await redis.ltrim(clubKey, 0, MAX_CLUB_EVENTS - 1);
    }
  } catch (_) { /* no-op */ }
};

module.exports = { trackEvent };
