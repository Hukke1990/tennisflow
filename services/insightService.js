'use strict';

/**
 * services/insightService.js
 *
 * Genera insights automáticos de negocio comparando métricas de uso
 * contra los límites del plan.
 *
 * Tipos de insight:
 *   'upgrade_suggestion' — el club se acerca a un límite (≥ 80 %)
 *   'limit_warning'      — el club está muy cerca del límite (≥ 90 %)
 *   'limit_exceeded'     — el club superó el límite
 *   'low_usage'          — poca actividad detectada
 */

/**
 * @param {{ torneos: number, partidos: number, inscripciones: number, actividad: number }} metrics
 * @param {{ max_torneos_activos: number, max_partidos_mes: number }} limits
 * @returns {{ type: string, metric: string, message: string, upgrade_required?: boolean }[]}
 */
const generateInsights = (metrics, limits) => {
  const insights = [];

  // Helper: ratio de uso (0 si el límite es Infinity)
  const usageRatio = (val, max) => (max === Infinity || !max ? 0 : val / max);

  // ─── Torneos activos ──────────────────────────────────────────────────────
  const ratioTorneos = usageRatio(metrics.torneos, limits.max_torneos_activos);

  if (ratioTorneos >= 1) {
    insights.push({ type: 'limit_exceeded',      metric: 'max_torneos_activos', message: 'Alcanzaste el límite de torneos activos de tu plan.',              upgrade_required: true  });
  } else if (ratioTorneos >= 0.9) {
    insights.push({ type: 'limit_warning',       metric: 'max_torneos_activos', message: 'Estás muy cerca del límite de torneos activos.',                   upgrade_required: true  });
  } else if (ratioTorneos >= 0.8) {
    insights.push({ type: 'upgrade_suggestion',  metric: 'max_torneos_activos', message: 'Estás cerca del límite de torneos activos. Considerá mejorar tu plan.', upgrade_required: false });
  }

  // ─── Partidos del mes ─────────────────────────────────────────────────────
  const ratioPartidos = usageRatio(metrics.partidos, limits.max_partidos_mes);

  if (ratioPartidos >= 1) {
    insights.push({ type: 'limit_exceeded',      metric: 'max_partidos_mes', message: 'Alcanzaste el límite mensual de partidos de tu plan.',  upgrade_required: true  });
  } else if (ratioPartidos >= 0.9) {
    insights.push({ type: 'limit_warning',       metric: 'max_partidos_mes', message: 'Te acercás al límite mensual de partidos.',              upgrade_required: true  });
  } else if (ratioPartidos >= 0.8) {
    insights.push({ type: 'upgrade_suggestion',  metric: 'max_partidos_mes', message: 'Estás cerca del límite mensual de partidos.',            upgrade_required: false });
  }

  // ─── Baja actividad ───────────────────────────────────────────────────────
  if (metrics.actividad < 10) {
    insights.push({ type: 'low_usage', metric: 'actividad', message: 'Baja actividad detectada en el club. ¿Necesitás ayuda para empezar?' });
  }

  return insights;
};

/**
 * Determina si se debe sugerir un plan superior.
 * Umbral: cualquier métrica principal ≥ 80 % del límite.
 *
 * @param {{ torneos: number, partidos: number }} metrics
 * @param {{ max_torneos_activos: number, max_partidos_mes: number }} limits
 * @returns {boolean}
 */
const shouldSuggestUpgrade = (metrics, limits) => {
  const overTorneos  = limits.max_torneos_activos && limits.max_torneos_activos !== Infinity
    && metrics.torneos  >= limits.max_torneos_activos * 0.8;

  const overPartidos = limits.max_partidos_mes && limits.max_partidos_mes !== Infinity
    && metrics.partidos >= limits.max_partidos_mes * 0.8;

  return overTorneos || overPartidos;
};

module.exports = { generateInsights, shouldSuggestUpgrade };
