'use strict';

/**
 * config/planLimits.js
 *
 * Fuente de verdad estática de los límites operacionales por plan.
 * Complementa services/planConfig.js (precios y features UI) con límites
 * de uso mensual y feature flags que se verifican en runtime.
 *
 * Valores Infinity → sin restricción (plan premium/test).
 * Estos valores se usan en:
 *   - middlewares/planLimiter.js  → enforcement en requests
 *   - utils/planResolver.js       → accessor
 *   - controllers/clubController  → endpoint GET /api/club/usage
 */

const PLAN_LIMITS = Object.freeze({
  basico: {
    max_torneos_activos: 1,
    max_canchas:         2,
    max_jugadores:       50,
    max_partidos_mes:    100,
    allow_dobles:        false,
  },

  pro: {
    max_torneos_activos: 5,
    max_canchas:         6,
    max_jugadores:       500,
    max_partidos_mes:    1000,
    allow_dobles:        true,
  },

  premium: {
    max_torneos_activos: Infinity,
    max_canchas:         Infinity,
    max_jugadores:       Infinity,
    max_partidos_mes:    Infinity,
    allow_dobles:        true,
  },

  // ⚠️  PLAN TEMPORAL DE PRUEBAS — sin restricciones
  test: {
    max_torneos_activos: Infinity,
    max_canchas:         Infinity,
    max_jugadores:       Infinity,
    max_partidos_mes:    Infinity,
    allow_dobles:        true,
  },
});

module.exports = { PLAN_LIMITS };
