'use strict';

/**
 * services/planRecommendationService.js
 *
 * Motor de recomendación de plan y copywriting SaaS.
 * Pure functions — sin I/O.
 *
 * getPlanPressure({ usage, limits }) → number (0 = sin uso, 1+ = al límite)
 * recommendPlan({ usage, limits, currentPlan }) → 'pro' | 'premium' | null
 * getPlanCopywriting(plan, pressure) → string (microcopy dinámico)
 */

/**
 * Calcula el ratio de uso para un valor dado un máximo.
 * Retorna 0 si max es Infinity, null o falsy.
 */
const safeRatio = (val, max) =>
  (!max || max === Infinity || val == null ? 0 : Math.min(1, (val || 0) / max));

/**
 * Presión del plan: suma de ratios de uso.
 * Máximo teórico = 4 (4 métricas todas al 100%).
 * Para fines prácticos: >= 0.7 → zona de upgrade.
 *
 * @param {{ usage: object, limits: object }} opts
 * @returns {number}
 */
const getPlanPressure = ({ usage = {}, limits = {} } = {}) => {
  const {
    torneos           = 0,
    canchas           = 0,
    jugadores_activos = 0,
    partidos          = 0,
  } = usage;

  const {
    max_torneos_activos,
    max_canchas,
    max_jugadores,
    max_partidos_mes,
  } = limits;

  const pressure =
    safeRatio(torneos,           max_torneos_activos) +
    safeRatio(canchas,           max_canchas)         +
    safeRatio(jugadores_activos, max_jugadores)       +
    safeRatio(partidos,          max_partidos_mes);

  return Math.round(pressure * 100) / 100;
};

/**
 * Convierte la presión (0-4) a un porcentaje visual (0-100).
 * Se normaliza sobre 2 métricas activas como referencia práctica.
 *
 * @param {number} pressure
 * @returns {number} 0-100
 */
const pressureToPct = (pressure) => Math.min(100, Math.round((pressure / 2) * 100));

/** Siguiente plan al actual */
const NEXT_PLAN = { basico: 'pro', pro: 'premium', premium: null, test: null };

/**
 * Recomienda el próximo plan si la presión supera el umbral.
 * Devuelve null si el club ya está en premium o si el uso es bajo.
 *
 * @param {{ usage: object, limits: object, currentPlan: string }} opts
 * @returns {'pro' | 'premium' | null}
 */
const recommendPlan = ({ usage = {}, limits = {}, currentPlan = 'basico' } = {}) => {
  const next = NEXT_PLAN[currentPlan] ?? null;
  if (!next) return null; // ya en premium/test

  const pressure = getPlanPressure({ usage, limits });
  return pressure >= 0.7 ? next : null;
};

// ─── Microcopy dinámico (FASE 9) ─────────────────────────────────────────────
const COPYS = {
  basico: {
    idle:    'Estás usando el plan gratuito',
    growing: 'Tu club está creciendo 🚀',
    high:    'Tu club está listo para Pro',
    maxed:   'Estás al límite — upgrade recomendado',
  },
  pro: {
    idle:    'Tu club está en el plan Pro',
    growing: 'Tu club está creciendo rápido 🚀',
    high:    'Tu club está listo para Premium',
    maxed:   'Estás al límite — upgrade recomendado',
  },
  premium: {
    idle:    'Tenés acceso a todo — Plan Premium',
    growing: 'Tu club está en su máximo nivel 🏆',
    high:    'Tu club está en su máximo nivel 🏆',
    maxed:   'Tu club está en su máximo nivel 🏆',
  },
  test: {
    idle:    'Modo test — sin restricciones',
    growing: 'Modo test — sin restricciones',
    high:    'Modo test — sin restricciones',
    maxed:   'Modo test — sin restricciones',
  },
};

/**
 * Devuelve el microcopy apropiado según el plan y la presión de uso.
 *
 * @param {string} plan
 * @param {number} pressure
 * @returns {string}
 */
const getPlanCopywriting = (plan, pressure) => {
  const copy = COPYS[plan] || COPYS.basico;
  if (pressure >= 1.5) return copy.maxed;
  if (pressure >= 0.7) return copy.high;
  if (pressure >= 0.3) return copy.growing;
  return copy.idle;
};

module.exports = { getPlanPressure, pressureToPct, recommendPlan, getPlanCopywriting, NEXT_PLAN };
