/**
 * services/planConfig.js
 *
 * Fuente de verdad en código para los límites y precios de cada plan.
 * Las claves ('basico', 'pro', 'premium') coinciden con los valores
 * almacenados en la columna `plan` de la tabla `clubes`.
 *
 * max_courts                    → máximo de canchas activas
 * max_simultaneous_tournaments  → máximo de torneos con fechas solapadas
 * has_live_scoring              → acceso al módulo de puntuación en vivo
 * monthly_price_usd             → precio mensual en USD
 * currency                      → moneda de cobro ('USD')
 * label                         → nombre visible del plan en la UI
 */

const CURRENCY = 'USD';

const PLAN_CONFIG = {
  basico: {
    max_courts: 2,
    max_simultaneous_tournaments: 2,
    has_live_scoring: false,
    monthly_price_usd: 30,
    currency: CURRENCY,
    label: 'Básico',
  },
  pro: {
    max_courts: 6,
    max_simultaneous_tournaments: 5,
    has_live_scoring: false,
    monthly_price_usd: 50,
    currency: CURRENCY,
    label: 'Pro',
  },
  premium: {
    max_courts: 100,
    max_simultaneous_tournaments: 100,
    has_live_scoring: true,
    monthly_price_usd: 70,
    currency: CURRENCY,
    label: 'Grand Slam',
  },
  // ⚠️  PLAN TEMPORAL DE PRUEBAS — eliminar antes de producción real
  test: {
    max_courts: 100,
    max_simultaneous_tournaments: 100,
    has_live_scoring: true,
    monthly_price_usd: 0,
    currency: CURRENCY,
    label: 'Test (1 ARS)',
  },
};

/**
 * Formatea el precio en el estilo visual "$50 USD/mes".
 * @param {number} amount
 * @returns {string}
 */
const formatPrice = (amount) => `$${amount} USD/mes`;

/**
 * Devuelve la configuración del plan dado, o el plan 'basico' como fallback.
 * @param {string} plan
 * @returns {{ max_courts: number, max_simultaneous_tournaments: number, has_live_scoring: boolean, monthly_price_usd: number, currency: string, label: string }}
 */
const getPlanConfig = (plan) => PLAN_CONFIG[plan] ?? PLAN_CONFIG.basico;

module.exports = { PLAN_CONFIG, getPlanConfig, formatPrice, CURRENCY };
