/**
 * hooks/useClubPlanRealtime.js
 *
 * Hook auxiliar que expone el plan actual del club y un booleano
 * `planJustChanged` que se activa brevemente cuando el plan cambia
 * en tiempo real (útil para mostrar un toast/banner de "¡Plan actualizado!").
 *
 * El canal de Realtime se gestiona en ClubContext — este hook solo
 * lee el valor reactivo de `clubPlan` y detecta transiciones.
 *
 * Uso:
 *   const { clubPlan, planJustChanged, previousPlan } = useClubPlanRealtime();
 */

import { useEffect, useRef, useState } from 'react';
import { useClub } from '../context/ClubContext';

const PLAN_LABELS = {
  basico:  'Básico',
  pro:     'Pro',
  premium: 'Grand Slam',
};

export function useClubPlanRealtime() {
  const { clubPlan } = useClub();

  const [planJustChanged, setPlanJustChanged] = useState(false);
  const [previousPlan, setPreviousPlan]       = useState(null);
  const prevPlanRef = useRef(clubPlan);

  useEffect(() => {
    const prev = prevPlanRef.current;

    // Ignorar la inicialización (no es un cambio real)
    if (prev === null || prev === clubPlan) {
      prevPlanRef.current = clubPlan;
      return;
    }

    // El plan cambió — guardar para UI y disparar flag
    setPreviousPlan(prev);
    setPlanJustChanged(true);
    prevPlanRef.current = clubPlan;

    // Apagar el flag después de 6 segundos (suficiente para mostrar un toast)
    const timer = setTimeout(() => setPlanJustChanged(false), 6000);
    return () => clearTimeout(timer);
  }, [clubPlan]);

  return {
    clubPlan,
    planLabel:      PLAN_LABELS[clubPlan]  ?? clubPlan,
    previousPlan,
    previousLabel:  PLAN_LABELS[previousPlan] ?? previousPlan,
    planJustChanged,
    isUpgrade:      planJustChanged && isPlanHigher(clubPlan, previousPlan),
    isDowngrade:    planJustChanged && isPlanHigher(previousPlan, clubPlan),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLAN_RANK = { basico: 0, pro: 1, premium: 2 };

function isPlanHigher(a, b) {
  return (PLAN_RANK[a] ?? -1) > (PLAN_RANK[b] ?? -1);
}
