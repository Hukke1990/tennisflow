'use strict';

/**
 * services/recommendationService.js
 *
 * Genera recomendaciones automáticas accionables para el club
 * basadas en métricas de uso, límites del plan y riesgo de churn.
 *
 * Tipos de recomendación:
 *   'reactivation' — club inactivo, necesita reactivarse
 *   'onboarding'   — nunca creó un torneo
 *   'upgrade'      — cerca del límite del plan
 *   'engagement'   — alta actividad, aprovechar para crecer
 */

/**
 * @param {{ torneos: number, partidos: number, inscripciones: number, actividad: number }} metrics
 * @param {{ max_partidos_mes: number, max_torneos_activos: number }} limits
 * @param {'high' | 'medium' | 'low'} churnRisk
 * @returns {{ type: string, message: string }[]}
 */
const generateRecommendations = (metrics, limits, churnRisk) => {
  const recs = [];

  // Club en alto riesgo de abandono
  if (churnRisk === 'high') {
    recs.push({
      type:    'reactivation',
      message: 'Tu club está inactivo. Creá un torneo para reactivar a los jugadores.',
    });
  }

  // Nunca creó un torneo — onboarding
  if (metrics.torneos === 0) {
    recs.push({
      type:    'onboarding',
      message: 'Creá tu primer torneo para empezar a usar la plataforma.',
    });
  }

  // Cerca del límite de partidos del plan
  if (
    limits.max_partidos_mes !== Infinity &&
    limits.max_partidos_mes &&
    metrics.partidos > limits.max_partidos_mes * 0.8
  ) {
    recs.push({
      type:    'upgrade',
      message: 'Estás cerca del límite de partidos de tu plan. Considerá mejorarlo para seguir creciendo.',
    });
  }

  // Cerca del límite de torneos activos
  if (
    limits.max_torneos_activos !== Infinity &&
    limits.max_torneos_activos &&
    metrics.torneos > limits.max_torneos_activos * 0.8
  ) {
    recs.push({
      type:    'upgrade',
      message: 'Estás cerca del límite de torneos activos de tu plan.',
    });
  }

  // Alta actividad — sugerir aprovechar el momentum
  if (metrics.actividad > 50) {
    recs.push({
      type:    'engagement',
      message: 'Tu club tiene alta actividad. Aprovechá para organizar más torneos y fidelizar jugadores.',
    });
  }

  return recs;
};

module.exports = { generateRecommendations };
