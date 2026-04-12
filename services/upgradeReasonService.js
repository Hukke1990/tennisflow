'use strict';

/**
 * services/upgradeReasonService.js
 *
 * Genera razones de upgrade context-aware basadas en el uso real del club.
 * Pure function — sin I/O.
 *
 * @param {{ usage: object, limits: object, plan: string }} opts
 *   usage.torneos           — torneos activos actuales (number | null)
 *   usage.canchas           — canchas activas actuales (number | null)
 *   usage.jugadores_activos — jugadores activos actuales (number | null)
 *   usage.partidos          — partidos del mes actual (number | null)
 *   limits                  — objeto PLAN_LIMITS[plan]
 *
 * Devuelve un array de razones con type: 'limit_reached' | 'warning'
 */

const safeGte = (val, threshold) =>
  val != null && threshold != null && threshold !== Infinity && val >= threshold;

const getUpgradeReasons = ({ usage = {}, limits = {}, plan } = {}) => {
  if (plan === 'premium' || plan === 'test') return [];

  const reasons = [];
  const {
    torneos          = null,
    canchas          = null,
    jugadores_activos = null,
    partidos         = null,
  } = usage;

  const {
    max_torneos_activos,
    max_canchas,
    max_jugadores,
    max_partidos_mes,
  } = limits;

  // ─── Torneos activos ──────────────────────────────────────────────────────
  if (torneos != null && max_torneos_activos && max_torneos_activos !== Infinity) {
    if (torneos >= max_torneos_activos) {
      reasons.push({
        type:    'limit_reached',
        metric:  'torneos',
        message: 'Llegaste al límite de torneos activos',
        pct:      Math.min(100, Math.round((torneos / max_torneos_activos) * 100)),
      });
    } else if (torneos >= max_torneos_activos * 0.8) {
      reasons.push({
        type:    'warning',
        metric:  'torneos',
        message: `Estás al ${Math.round((torneos / max_torneos_activos) * 100)}% del límite de torneos`,
        pct:      Math.round((torneos / max_torneos_activos) * 100),
      });
    }
  }

  // ─── Canchas ─────────────────────────────────────────────────────────────
  if (canchas != null && max_canchas && max_canchas !== Infinity) {
    if (canchas >= max_canchas) {
      reasons.push({
        type:    'limit_reached',
        metric:  'canchas',
        message: 'No podés crear más canchas en tu plan actual',
        pct:      Math.min(100, Math.round((canchas / max_canchas) * 100)),
      });
    } else if (canchas >= max_canchas * 0.8) {
      reasons.push({
        type:    'warning',
        metric:  'canchas',
        message: `Estás al ${Math.round((canchas / max_canchas) * 100)}% del límite de canchas`,
        pct:      Math.round((canchas / max_canchas) * 100),
      });
    }
  }

  // ─── Jugadores activos ────────────────────────────────────────────────────
  if (jugadores_activos != null && max_jugadores && max_jugadores !== Infinity) {
    if (jugadores_activos >= max_jugadores) {
      reasons.push({
        type:    'limit_reached',
        metric:  'jugadores',
        message: 'Límite de jugadores activos alcanzado',
        pct:     100,
      });
    } else if (jugadores_activos >= max_jugadores * 0.8) {
      reasons.push({
        type:    'warning',
        metric:  'jugadores',
        message: `Estás al ${Math.round((jugadores_activos / max_jugadores) * 100)}% de jugadores permitidos`,
        pct:      Math.round((jugadores_activos / max_jugadores) * 100),
      });
    }
  }

  // ─── Partidos mensuales ───────────────────────────────────────────────────
  if (partidos != null && max_partidos_mes && max_partidos_mes !== Infinity) {
    if (partidos >= max_partidos_mes) {
      reasons.push({
        type:    'limit_reached',
        metric:  'partidos',
        message: 'Alcanzaste el límite mensual de partidos',
        pct:     100,
      });
    } else if (partidos >= max_partidos_mes * 0.8) {
      reasons.push({
        type:    'warning',
        metric:  'partidos',
        message: `Estás al ${Math.round((partidos / max_partidos_mes) * 100)}% del límite mensual de partidos`,
        pct:      Math.round((partidos / max_partidos_mes) * 100),
      });
    }
  }

  return reasons;
};

module.exports = { getUpgradeReasons };
