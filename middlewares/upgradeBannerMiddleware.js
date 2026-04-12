'use strict';

/**
 * middlewares/upgradeBannerMiddleware.js
 *
 * Middleware que calcula el banner de upgrade contextual y lo adjunta a req.
 * Aplicar selectivamente en rutas que necesiten exponer el banner al cliente.
 *
 * req.upgradeBanner = {
 *   show:    boolean,
 *   message: string,
 *   cta:     string,
 *   plan:    string,
 *   pressure_pct: number,
 *   recommended_plan: string | null,
 * }
 *
 * Fail-open: si falla alguna llamada, attacha banner vacío y continúa.
 *
 * @example
 *   router.get('/dashboard', requireAuth, upgradeBannerMiddleware, controller.getDashboard);
 */

const { getClubPlan, getPlanLimits } = require('../utils/planResolver');
const { getClubMetrics }             = require('../utils/analyticsAggregator');
const { getUsage }                   = require('../utils/usageTracker');
const {
  getPlanPressure,
  pressureToPct,
  recommendPlan,
  getPlanCopywriting,
} = require('../services/planRecommendationService');

const EMPTY_BANNER = {
  show:             false,
  message:          '',
  cta:              '',
  plan:             null,
  pressure_pct:     0,
  recommended_plan: null,
  copywriting:      null,
};

/**
 * @type {import('express').RequestHandler}
 */
const upgradeBannerMiddleware = async (req, _res, next) => {
  try {
    const clubId = req.authUser?.club_id;
    if (!clubId) {
      req.upgradeBanner = EMPTY_BANNER;
      return next();
    }

    // Lanzar en paralelo — si alguna falla, la catch global lo captura
    const [plan, metrics, partidosMes] = await Promise.all([
      getClubPlan(clubId),
      getClubMetrics(clubId),
      getUsage(clubId, 'partidos_mes'),
    ]);

    const limits  = getPlanLimits(plan);
    const usage   = {
      torneos:           metrics.torneos  || 0,
      canchas:           null,               // no disponible en analytics counters
      jugadores_activos: null,
      partidos:          partidosMes,
    };

    const pressure        = getPlanPressure({ usage, limits });
    const pressurePct     = pressureToPct(pressure);
    const recommendedPlan = recommendPlan({ usage, limits, currentPlan: plan });
    const copywriting     = getPlanCopywriting(plan, pressure);

    req.upgradeBanner = {
      show:             pressurePct >= 70,
      message:          pressurePct >= 90
        ? 'Estás al límite — upgrade recomendado'
        : 'Estás cerca del límite de tu plan',
      cta:              'Ver planes',
      plan,
      pressure_pct:     pressurePct,
      recommended_plan: recommendedPlan,
      copywriting,
    };
  } catch (_) {
    req.upgradeBanner = EMPTY_BANNER;
  }

  return next();
};

module.exports = { upgradeBannerMiddleware };
