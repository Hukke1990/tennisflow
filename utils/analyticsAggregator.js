'use strict';

/**
 * utils/analyticsAggregator.js
 *
 * Agrega métricas de la lista analytics:events en Redis para un club específico
 * o para todos los clubs (métricas globales).
 *
 * Lee hasta 10 000 eventos más recientes (capped list).
 * Para alto volumen → migrar a índice separado por club.
 */

const { getCounter } = require('./analyticsCounters');

/**
 * Devuelve métricas de actividad de un club específico.
 * O(1): lee contadores Redis INCR en paralelo — sin escanear listas.
 *
 * @param {string} clubId
 * @returns {Promise<{ torneos: number, partidos: number, inscripciones: number, actividad: number }>}
 */
const getClubMetrics = async (clubId) => {
  const empty = { torneos: 0, partidos: 0, inscripciones: 0, actividad: 0 };
  if (!clubId) return empty;

  try {
    const [torneos, partidos, inscripciones] = await Promise.all([
      getCounter(clubId, 'torneos'),
      getCounter(clubId, 'partidos'),
      getCounter(clubId, 'inscripciones'),
    ]);

    return {
      torneos,
      partidos,
      inscripciones,
      actividad: torneos + partidos + inscripciones,
    };
  } catch (_) {
    return empty;
  }
};

/**
 * Devuelve métricas globales (multi-tenant) y ranking de clubs.
 * @returns {Promise<{ total_events, torneos_creados, partidos_jugados, inscripciones, clubs_activos, top_clubs }>}
 */
const MAX_GLOBAL_READ = 1_000;

const getGlobalMetrics = async () => {
  const empty = { total_events: 0, torneos_creados: 0, partidos_jugados: 0, inscripciones: 0, clubs_activos: 0, top_clubs: [] };

  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return empty;

    const raw    = await getClient().lrange('analytics:events', 0, MAX_GLOBAL_READ - 1);
    const events = raw
      .map((e) => { try { return JSON.parse(e); } catch (_) { return null; } })
      .filter(Boolean);

    const clubHits = {};
    for (const e of events) {
      if (e.club_id) clubHits[e.club_id] = (clubHits[e.club_id] || 0) + 1;
    }

    const topClubs = Object.entries(clubHits)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([club_id, hits]) => ({ club_id, hits }));

    return {
      total_events:     events.length,
      torneos_creados:  events.filter((e) => e.event === 'torneo_creado').length,
      partidos_jugados: events.filter((e) => e.event === 'partido_jugado').length,
      inscripciones:    events.filter((e) => e.event === 'jugador_inscripto').length,
      clubs_activos:    Object.keys(clubHits).length,
      top_clubs:        topClubs,
    };
  } catch (_) {
    return empty;
  }
};

module.exports = { getClubMetrics, getGlobalMetrics };
