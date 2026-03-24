/**
 * hooks/usePlanRestrictions.js
 *
 * Devuelve el estado actual de uso del plan del club y si supera los límites.
 *
 * Retorna:
 *   currentCourts                – cantidad de canchas activas del club
 *   currentTournamentsThisWeekend – torneos que se solapan con este fin de semana
 *   limits                       – { max_courts, max_simultaneous_tournaments, has_live_scoring }
 *   isOverLimit                  – { courts: bool, tournaments: bool }
 *   loading                      – true mientras se cargan los datos
 *   refresh                      – función para recargar manualmente
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useClub } from '../context/ClubContext';

// Límites hardcodeados que espejo de services/planConfig.js del backend.
// Claves coinciden con clubes.plan ('basico' | 'pro' | 'premium').
const PLAN_LIMITS = {
  basico:  { max_courts: 2,   max_simultaneous_tournaments: 2,   has_live_scoring: false },
  pro:     { max_courts: 6,   max_simultaneous_tournaments: 5,   has_live_scoring: false },
  premium: { max_courts: 100, max_simultaneous_tournaments: 100, has_live_scoring: true  },
};

/**
 * Devuelve el próximo sábado como fecha de inicio del fin de semana
 * y el domingo siguiente como fecha de fin.
 */
function getThisWeekend() {
  const now = new Date();
  const day = now.getDay(); // 0=Dom, 6=Sáb
  const daysUntilSaturday = day === 6 ? 0 : (6 - day);
  const saturday = new Date(now);
  saturday.setDate(now.getDate() + daysUntilSaturday);
  saturday.setHours(0, 0, 0, 0);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);
  return { start: saturday.toISOString(), end: sunday.toISOString() };
}

export function usePlanRestrictions() {
  const { clubId, clubPlan } = useClub();

  const [currentCourts, setCurrentCourts] = useState(0);
  const [currentTournamentsThisWeekend, setCurrentTournamentsThisWeekend] = useState(0);
  const [loading, setLoading] = useState(true);

  const limits = PLAN_LIMITS[clubPlan] ?? PLAN_LIMITS.basico;

  const fetchData = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);

    try {
      // 1. Contar canchas activas del club
      const { count: courtsCount } = await supabase
        .from('canchas')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId);

      setCurrentCourts(courtsCount ?? 0);

      // 2. Contar torneos que se solapan con este fin de semana (RPC)
      const { start, end } = getThisWeekend();
      const { data: overlapCount } = await supabase.rpc('check_tournament_overlap', {
        p_club_id:    clubId,
        p_start_date: start,
        p_end_date:   end,
      });

      setCurrentTournamentsThisWeekend(overlapCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isOverLimit = {
    courts:      limits.max_courts !== 100 && currentCourts >= limits.max_courts,
    tournaments: limits.max_simultaneous_tournaments !== 100 &&
                 currentTournamentsThisWeekend >= limits.max_simultaneous_tournaments,
  };

  return {
    currentCourts,
    currentTournamentsThisWeekend,
    limits,
    isOverLimit,
    loading,
    refresh: fetchData,
  };
}
