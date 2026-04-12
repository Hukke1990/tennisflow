'use strict';

/**
 * controllers/clubController.js
 *
 * GET /api/club/usage — Devuelve el plan activo, los límites y el uso mensual del club.
 *
 * Respuesta:
 * {
 *   "plan": "pro",
 *   "limits": { "max_torneos_activos": 5, "max_jugadores": 500, "max_partidos_mes": 1000, "allow_dobles": true },
 *   "usage":  { "torneos_activos": 3, "partidos_mes": 120 }
 * }
 *
 * - torneos_activos: conteo en DB (estados no finalizados/cancelados)
 * - partidos_mes:    contador Redis del mes actual
 * - Infinity se serializa como null (JSON no soporta Infinity)
 */

const { getClubPlan, getPlanLimits }           = require('../utils/planResolver');
const { getUsage }                              = require('../utils/usageTracker');
const { getClubMetrics }                        = require('../utils/analyticsAggregator');
const { generateInsights, shouldSuggestUpgrade } = require('../services/insightService');
const { calculateChurnScore, classifyChurn }    = require('../services/churnService');
const { generateRecommendations }               = require('../services/recommendationService');
const { getUpgradeReasons }                     = require('../services/upgradeReasonService');
const { getPlanPressure, pressureToPct, recommendPlan, getPlanCopywriting } = require('../services/planRecommendationService');
const { findById }                              = require('../repositories/clubRepository');
const supabase                                  = require('../services/supabase');
const { handleError }                           = require('../utils/errors');
const logger                                    = require('../services/logger');
const { trackEvent }                            = require('../utils/analytics');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const ESTADOS_ACTIVOS = ['borrador', 'publicado', 'abierto', 'en_progreso'];

const getClubUsage = async (req, res) => {
  try {
    const clubId = req.authUser?.club_id;
    if (!clubId) {
      return res.status(400).json({ error: 'club_id requerido' });
    }

    // Resolver plan y uso en paralelo
    const [plan, usagePartidosMes] = await Promise.all([
      getClubPlan(clubId),
      getUsage(clubId, 'partidos_mes'),
    ]);

    const limits = getPlanLimits(plan);

    // Contar torneos activos desde DB (source of truth)
    const { count: torneosActivos, error: countError } = await supabase
      .from('torneos')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .in('estado', ESTADOS_ACTIVOS);

    if (countError) {
      logger.warn('club.usage.count_error', { club_id: clubId, error: countError.message });
    }

    // Serializar Infinity → null (no es válido en JSON)
    const serializeLimit = (v) => (v === Infinity ? null : v);

    return res.status(200).json({
      plan,
      limits: {
        max_torneos_activos: serializeLimit(limits.max_torneos_activos),
        max_jugadores:       serializeLimit(limits.max_jugadores),
        max_partidos_mes:    serializeLimit(limits.max_partidos_mes),
        allow_dobles:        limits.allow_dobles,
      },
      usage: {
        torneos_activos: torneosActivos ?? 0,
        partidos_mes:    usagePartidosMes,
      },
    });
  } catch (err) {
    return handleError(res, err, logger);
  }
};

module.exports = { getClubUsage, getClubAnalytics, getClubInsights };

async function getClubAnalytics(req, res) {
  try {
    const clubId = req.authUser?.club_id;
    if (!clubId) return res.status(400).json({ error: 'club_id requerido' });

    const [plan, metrics] = await Promise.all([
      getClubPlan(clubId),
      getClubMetrics(clubId),
    ]);

    const limits   = getPlanLimits(plan);
    const insights = generateInsights(metrics, limits);

    // FASE 9 — Alerta de negocio si se excede el límite de partidos
    const usagePartidosMes = await getUsage(clubId, 'partidos_mes');
    if (limits.max_partidos_mes !== Infinity && usagePartidosMes > limits.max_partidos_mes) {
      logger.alert('plan_limit_exceeded', {
        alert_type: 'plan_limit_exceeded',
        club_id:    clubId,
        plan,
        metric:     'max_partidos_mes',
        limit:      limits.max_partidos_mes,
        current:    usagePartidosMes,
      });
    }

    return res.status(200).json({
      plan,
      metrics,
      insights,
      upgrade_suggested: shouldSuggestUpgrade(metrics, limits),
    });
  } catch (err) {
    return handleError(res, err, logger);
  }
}

// ─── GET /api/club/insights ───────────────────────────────────────────────────

async function getClubInsights(req, res) {
  try {
    const clubId = req.authUser?.club_id || req.query.club_id;
    if (!clubId) return res.status(400).json({ error: 'club_id requerido' });

    // Lanzar todas las consultas en paralelo: plan + analytics + club meta + DB counts
    const [
      plan,
      metrics,
      club,
      torneosResult,
      canchasResult,
      partidosMes,
    ] = await Promise.all([
      getClubPlan(clubId),
      getClubMetrics(clubId),
      findById(clubId, 'created_at'),
      // Conteo real de torneos activos desde DB (source of truth para upgrade reasons)
      supabase.from('torneos').select('id', { count: 'exact', head: true })
        .eq('club_id', clubId).in('estado', ESTADOS_ACTIVOS),
      // Conteo real de canchas activas
      supabase.from('canchas').select('id', { count: 'exact', head: true })
        .eq('club_id', clubId),
      // Contador mensual Redis
      getUsage(clubId, 'partidos_mes'),
    ]);

    const limits = getPlanLimits(plan);

    // ── Churn engine ─────────────────────────────────────────────────────────
    const score   = calculateChurnScore(metrics, limits);
    const risk    = classifyChurn(score);
    const recommendations = generateRecommendations(metrics, limits, risk);

    // ── Upgrade intelligence ─────────────────────────────────────────────────
    const usage = {
      torneos:          torneosResult.count  ?? 0,
      canchas:          canchasResult.count  ?? 0,
      jugadores_activos: null, // requeriría query extra — skip
      partidos:         partidosMes,
    };

    const upgradeReasons  = getUpgradeReasons({ usage, limits, plan });
    const pressure        = getPlanPressure({ usage, limits });
    const pressurePct     = pressureToPct(pressure);
    const recommendedPlan = recommendPlan({ usage, limits, currentPlan: plan });
    const copywriting     = getPlanCopywriting(plan, pressure);

    const banner = {
      show:    pressurePct >= 70,
      message: pressurePct >= 90
        ? 'Estás al límite — upgrade recomendado'
        : 'Estás cerca del límite de tu plan',
      cta: 'Ver planes',
    };

    // ── Logs ─────────────────────────────────────────────────────────────────
    logger.info('ai_insights_generated', {
      club_id:     clubId,
      plan,
      churn_score: score,
      churn_risk:  risk,
      pressure_pct: pressurePct,
    });

    // Alerta de churn — sólo clubs con > 7 días de vida
    const clubAgeMs = club?.created_at
      ? Date.now() - new Date(club.created_at).getTime()
      : Infinity;
    const isNewClub = clubAgeMs < SEVEN_DAYS_MS;

    if (risk === 'high' && !isNewClub) {
      logger.alert('high_churn_risk', {
        alert_type:    'high_churn_risk',
        club_id:       clubId,
        plan,
        churn_score:   score,
        metrics,
        club_age_days: Math.floor(clubAgeMs / (24 * 60 * 60 * 1000)),
      });
    }

    // Alerta de presión de plan alta
    if (pressurePct >= 90 && plan !== 'premium' && plan !== 'test') {
      logger.alert('plan_pressure_high', {
        alert_type:   'plan_pressure_high',
        club_id:      clubId,
        plan,
        pressure_pct: pressurePct,
        usage,
        recommended:  recommendedPlan,
      });
    }

    // Tracking: upgrade_view (fire-and-forget)
    trackEvent('upgrade_view', { club_id: clubId, plan, pressure_pct: pressurePct }).catch(() => {});

    return res.status(200).json({
      // Churn
      churn_score:  score,
      churn_risk:   risk,
      recommendations,
      // Upgrade intelligence
      upgrade: {
        reasons:          upgradeReasons,
        recommended_plan: recommendedPlan,
        pressure:         pressure,
        pressure_pct:     pressurePct,
        copywriting,
        banner,
        usage,
      },
    });
  } catch (err) {
    return handleError(res, err, logger);
  }
}

