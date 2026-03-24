/**
 * services/planConfig.js
 *
 * Fuente de verdad en código para los límites de cada plan.
 * Las claves ('basico', 'pro', 'premium') coinciden con los valores
 * almacenados en la columna `plan` de la tabla `clubes`.
 *
 * max_courts                  → máximo de canchas activas
 * max_simultaneous_tournaments → máximo de torneos con fechas solapadas
 * has_live_scoring            → acceso al módulo de puntuación en vivo
 */

const PLAN_CONFIG = {
  basico: {
    max_courts: 2,
    max_simultaneous_tournaments: 2,
    has_live_scoring: false,
  },
  pro: {
    max_courts: 6,
    max_simultaneous_tournaments: 5,
    has_live_scoring: false,
  },
  premium: {
    max_courts: 100,
    max_simultaneous_tournaments: 100,
    has_live_scoring: true,
  },
};

/**
 * Devuelve la configuración del plan dado, o el plan 'basico' como fallback.
 * @param {string} plan
 * @returns {{ max_courts: number, max_simultaneous_tournaments: number, has_live_scoring: boolean }}
 */
const getPlanConfig = (plan) => PLAN_CONFIG[plan] ?? PLAN_CONFIG.basico;

module.exports = { PLAN_CONFIG, getPlanConfig };
