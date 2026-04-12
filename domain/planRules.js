/**
 * domain/planRules.js
 *
 * Reglas puras de dominio sobre planes de suscripción.
 * ❌ Sin I/O  ❌ Sin Supabase  ❌ Sin req/res
 */

'use strict';

const { PLAN_CONFIG, getPlanConfig } = require('../services/planConfig');

/**
 * Devuelve true si el plan permite acceso a scoring en vivo.
 * @param {string} plan
 */
const hasLiveScoring = (plan) => getPlanConfig(plan)?.has_live_scoring ?? false;

/**
 * Devuelve true si el plan permite publicidad (ads).
 * Solo planes 'pro' y 'premium'.
 * @param {string} plan
 */
const hasAdsFeature = (plan) => ['pro', 'premium'].includes(plan);

/**
 * Devuelve true si el plan permite white-label.
 * Solo plan 'premium'.
 * @param {string} plan
 */
const hasWhiteLabel = (plan) => plan === 'premium';

/**
 * Calcula el monto en ARS para el plan dado, usando la cotización del dólar.
 *
 * @param {string} plan          - Nombre del plan
 * @param {number} usdToArs      - Cotización USD → ARS
 * @returns {number}             - Monto en ARS (entero)
 */
const calcularMontoArs = (plan, usdToArs) => {
  const config = getPlanConfig(plan);
  return Math.round((config?.monthly_price_usd ?? 0) * usdToArs);
};

/**
 * Devuelve la lista de planes ordenados por precio para mostrar en UI.
 * @returns {Array<{ id: string, label: string, monthly_price_usd: number, has_live_scoring: boolean }>}
 */
const getPlanesList = () =>
  Object.entries(PLAN_CONFIG)
    .filter(([id]) => id !== 'test') // excluir plan interno
    .map(([id, cfg]) => ({
      id,
      label:              cfg.label,
      monthly_price_usd:  cfg.monthly_price_usd,
      has_live_scoring:   cfg.has_live_scoring,
      max_courts:         cfg.max_courts,
      max_torneos:        cfg.max_simultaneous_tournaments,
    }))
    .sort((a, b) => a.monthly_price_usd - b.monthly_price_usd);

/**
 * Regla: ¿puede el club hacer un downgrade directo, o debe diferirse?
 * Se difiere si hay un torneo activo (el caller valida esto).
 * @param {string} planActual
 * @param {string} planNuevo
 * @returns {boolean}
 */
const isDowngrade = (planActual, planNuevo) => {
  const orden = { basico: 0, pro: 1, premium: 2 };
  return (orden[planNuevo] ?? 0) < (orden[planActual] ?? 0);
};

module.exports = {
  hasLiveScoring,
  hasAdsFeature,
  hasWhiteLabel,
  calcularMontoArs,
  getPlanesList,
  isDowngrade,
};
