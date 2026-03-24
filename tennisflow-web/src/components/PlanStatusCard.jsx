/**
 * PlanStatusCard.jsx
 *
 * Tarjeta "Estado de tu Plan" para el Dashboard de Admin.
 * Muestra barras de progreso de canchas y torneos simultáneos,
 * y un CTA para subir de plan cuando el club está en el límite.
 *
 * Props:
 *   currentCourts                – número de canchas activas
 *   currentTournamentsThisWeekend – torneos solapados este fin de semana
 *   limits                       – { max_courts, max_simultaneous_tournaments }
 *   isOverLimit                  – { courts: bool, tournaments: bool }
 *   loading                      – skeleton si aún carga
 *   onUpgrade                    – callback para ir al tab Mi Plan
 */

import React from 'react';

// ─── Barra de progreso ────────────────────────────────────────────────────────
function ProgressBar({ label, current, max, isUnlimited = false }) {
  const pct = isUnlimited ? 15 : Math.min(100, (current / max) * 100);
  const full = !isUnlimited && current >= max;
  const near = !isUnlimited && !full && pct >= 80;

  const trackColor = full ? 'bg-red-100' : 'bg-gray-100';
  const fillColor  = full ? 'bg-red-500' : near ? 'bg-amber-400' : 'bg-emerald-500';
  const textColor  = full ? 'text-red-600 font-bold' : near ? 'text-amber-600' : 'text-gray-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className={`text-xs ${textColor}`}>
          {isUnlimited ? (
            <span className="text-emerald-600 font-semibold">Ilimitado ✓</span>
          ) : full ? (
            <span>{current} / {max} — Límite alcanzado</span>
          ) : (
            <span>{current} de {max}</span>
          )}
        </span>
      </div>

      <div className={`w-full h-2.5 rounded-full ${trackColor}`}>
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${fillColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {full && !isUnlimited && (
        <p className="text-xs text-red-500">
          Alcanzaste el máximo de tu plan. Subí de plan para agregar más.
        </p>
      )}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded" />
      <div className="space-y-3">
        <div className="h-2.5 bg-gray-200 rounded-full" />
        <div className="h-2.5 bg-gray-200 rounded-full w-4/5" />
      </div>
    </div>
  );
}

// ─── Card principal ───────────────────────────────────────────────────────────
export default function PlanStatusCard({
  currentCourts,
  currentTournamentsThisWeekend,
  limits,
  isOverLimit,
  loading,
  onUpgrade,
}) {
  if (loading) return <CardSkeleton />;

  const someAtLimit = isOverLimit.courts || isOverLimit.tournaments;
  const unlimited   = limits.max_courts >= 100;

  return (
    <div className={`rounded-2xl shadow-sm border p-5 sm:p-6 space-y-5 ${
      someAtLimit
        ? 'bg-red-50 border-red-200'
        : 'bg-white border-gray-100'
    }`}>
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">📊</span>
          <h3 className="text-base font-bold text-gray-900">Estado de tu Plan</h3>
        </div>
        {someAtLimit && (
          <button
            type="button"
            onClick={() => onUpgrade(isOverLimit.courts ? 'cancha' : 'torneo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <span>⚡</span>
            Subir de Plan
          </button>
        )}
      </div>

      {/* Barras */}
      <div className="space-y-4">
        <ProgressBar
          label="Canchas activas"
          current={currentCourts}
          max={limits.max_courts}
          isUnlimited={unlimited}
        />
        <ProgressBar
          label="Capacidad este fin de semana"
          current={currentTournamentsThisWeekend}
          max={limits.max_simultaneous_tournaments}
          isUnlimited={unlimited}
        />
      </div>

      {/* Pie informativo */}
      {!someAtLimit && !unlimited && (
        <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
          El límite de torneos se calcula sobre eventos activos durante el próximo fin de semana.
        </p>
      )}
    </div>
  );
}
