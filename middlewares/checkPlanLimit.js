/**
 * middlewares/checkPlanLimit.js
 *
 * Middleware factory de Express.
 * Uso: checkPlanLimit('cancha') | checkPlanLimit('torneo')
 *
 * Retorna 403 con código 'PLAN_LIMIT' si el club alcanzó su tope de recursos.
 * Debe usarse DESPUÉS de requireAuth (ya que necesita req.authUser.club_id).
 */

const { checkLimit } = require('../services/planLimits');

const PLAN_LABELS = {
  basico: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
};

const RESOURCE_LABELS = {
  torneo: 'torneos',
  cancha: 'canchas',
};

/**
 * @param {'torneo'|'cancha'} resourceType
 * @returns {import('express').RequestHandler}
 */
const checkPlanLimit = (resourceType) => async (req, res, next) => {
  try {
    const clubId =
      req.authUser?.club_id ||
      String(req.query?.club_id || req.headers?.['x-club-id'] || '').trim();

    if (!clubId) {
      return res.status(400).json({ error: 'club_id requerido para verificar límite del plan' });
    }

    const { allowed, current, limit, plan, error } = await checkLimit(clubId, resourceType);

    if (error) {
      // Error interno al verificar → no bloqueamos
      return next();
    }

    if (!allowed) {
      const planLabel = PLAN_LABELS[plan] || plan;
      const resourceLabel = RESOURCE_LABELS[resourceType] || resourceType;

      return res.status(403).json({
        code: 'LIMIT_REACHED',
        resource: resourceType,
        current,
        limit,
        plan,
        message: `Alcanzaste el límite de ${limit} ${resourceLabel} en el plan ${planLabel}. ¡Actualizá tu plan para continuar!`,
      });
    }

    next();
  } catch (err) {
    console.error('[checkPlanLimit]', err.message || err);
    // Error inesperado → no bloqueamos al usuario
    next();
  }
};

module.exports = { checkPlanLimit };
