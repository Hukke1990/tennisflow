'use strict';

/**
 * middlewares/planLimiter.js
 *
 * Middleware factories para enforcement de límites de plan.
 *
 * enforcePlanLimit(metric, getLimitFn) — verifica uso mensual Redis vs límite del plan
 * enforceDoblesAllowed()               — bloquea torneos de dobles si el plan no lo permite
 *
 * Ambos son fail-open: si hay error interno, dejan pasar el request.
 * Requieren requireAuth previo (usan req.authUser.club_id).
 *
 * Respuesta de bloqueo:
 * {
 *   error: 'Límite de plan alcanzado',
 *   code: 'PLAN_LIMIT_EXCEEDED',
 *   metric, limit, current,
 *   upgrade_required: true
 * }
 */

const { getPlanLimits, getClubPlan } = require('../utils/planResolver');
const { getUsage }                   = require('../utils/usageTracker');

/**
 * Middleware factory: verifica límite de uso mensual Redis.
 *
 * @param {string}                      metric      - ej: 'partidos_mes'
 * @param {(limits: object) => number}  getLimitFn  - extractor del límite desde PLAN_LIMITS
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.post('/', requireAuth, requireAdmin,
 *   enforcePlanLimit('partidos_mes', l => l.max_partidos_mes),
 *   controller.handler
 * );
 */
const enforcePlanLimit = (metric, getLimitFn) => async (req, res, next) => {
  try {
    const clubId = req.authUser?.club_id;
    if (!clubId) return next();

    const plan   = await getClubPlan(clubId);
    const limits = getPlanLimits(plan);
    const limit  = getLimitFn(limits);

    // Infinity o -1 → sin restricción
    if (limit === Infinity || limit === -1) return next();

    const usage = await getUsage(clubId, metric);

    if (usage >= limit) {
      return res.status(403).json({
        error:            'Límite de plan alcanzado',
        code:             'PLAN_LIMIT_EXCEEDED',
        metric,
        limit,
        current:          usage,
        upgrade_required: true,
      });
    }

    return next();
  } catch (_) {
    // Fail-open: no bloquear ante error interno
    return next();
  }
};

/**
 * Middleware: bloquea la creación de torneos de dobles si el plan no lo permite.
 * Lee req.body.modalidad (y aliases) para detectar si es dobles.
 *
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.post('/', requireAuth, requireAdmin, checkPlanLimit('torneo'),
 *   enforceDoblesAllowed(),
 *   controller.crearTorneo
 * );
 */
const enforceDoblesAllowed = () => async (req, res, next) => {
  try {
    const clubId = req.authUser?.club_id;
    if (!clubId) return next();

    // Leer modalidad de todos los aliases posibles del body
    const rawModalidad = String(
      req.body?.modalidad ??
      req.body?.tipo_modalidad ??
      req.body?.tipoModalidad ??
      req.body?.tipo ??
      ''
    );

    const isDobles = /dobles|double/i.test(rawModalidad);
    if (!isDobles) return next();

    const plan   = await getClubPlan(clubId);
    const limits = getPlanLimits(plan);

    if (!limits.allow_dobles) {
      return res.status(403).json({
        error:            'Tu plan no permite torneos de dobles',
        code:             'PLAN_LIMIT_EXCEEDED',
        metric:           'allow_dobles',
        upgrade_required: true,
      });
    }

    return next();
  } catch (_) {
    return next();
  }
};

module.exports = { enforcePlanLimit, enforceDoblesAllowed };
