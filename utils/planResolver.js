'use strict';

/**
 * utils/planResolver.js
 *
 * Resuelve los límites del plan activo de un club.
 *
 * getPlanLimits(plan) — lookup estático en config/planLimits
 * getClubPlan(clubId) — consulta Supabase para obtener el plan del club
 *
 * Fail-safe: si Supabase falla, devuelve 'basico' (plan más restrictivo).
 */

const { PLAN_LIMITS } = require('../config/planLimits');
const supabase        = require('../services/supabase');

/**
 * Devuelve los límites del plan dado. Fallback: basico.
 * @param {string} plan
 * @returns {typeof PLAN_LIMITS.basico}
 */
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.basico;

/**
 * Obtiene el plan activo del club desde Supabase.
 * @param {string} clubId
 * @returns {Promise<string>}
 */
const getClubPlan = async (clubId) => {
  if (!clubId) return 'basico';
  try {
    const { data } = await supabase
      .from('clubes')
      .select('plan')
      .eq('id', clubId)
      .maybeSingle();
    return data?.plan || 'basico';
  } catch (_) {
    return 'basico';
  }
};

module.exports = { getPlanLimits, getClubPlan };
