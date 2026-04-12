'use strict';

/**
 * services/churnService.js
 *
 * Motor de scoring de riesgo de abandono (churn) por club.
 *
 * El score parte de 0 y sube con actividad real.
 * Penalizaciones por inactividad bajan el score.
 *
 * Rangos:
 *   score < 0   → riesgo 'high'
 *   score < 50  → riesgo 'medium'
 *   score >= 50 → riesgo 'low'
 */

/**
 * Calcula el churn score del club basado en métricas de uso y límites del plan.
 *
 * @param {{ torneos: number, partidos: number, inscripciones: number, actividad: number }} metrics
 * @param {{ max_partidos_mes: number }} limits
 * @returns {number}
 */
const calculateChurnScore = (metrics, limits) => {
  let score = 0;

  // Actividad general — peso bajo (puede ser pasiva)
  score += metrics.actividad * 0.3;

  // Features clave — pesos más altos
  score += metrics.partidos * 0.5;
  score += metrics.torneos  * 2;

  // Penalización por baja actividad total
  if (metrics.actividad < 10) score -= 20;
  if (metrics.partidos   === 0) score -= 30;

  // Penalización por bajo uso del plan (< 20 % del límite de partidos)
  const usageRatio = limits.max_partidos_mes === Infinity || !limits.max_partidos_mes
    ? 0
    : metrics.partidos / limits.max_partidos_mes;

  if (usageRatio < 0.2) score -= 15;

  return Math.round(score * 10) / 10; // un decimal
};

/**
 * Clasifica el riesgo de churn en base al score.
 *
 * @param {number} score
 * @returns {'high' | 'medium' | 'low'}
 */
const classifyChurn = (score) => {
  if (score < 0)  return 'high';
  if (score < 50) return 'medium';
  return 'low';
};

module.exports = { calculateChurnScore, classifyChurn };
