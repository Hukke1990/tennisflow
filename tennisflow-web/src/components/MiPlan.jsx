import { useEffect, useState } from 'react';
import axios from 'axios';
import { useClub } from '../context/ClubContext';

const PLAN_LABELS = {
  basico: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
};

const PLAN_COLORS = {
  basico: { badge: 'bg-slate-100 text-slate-700 border-slate-200', bar: 'bg-slate-400' },
  pro: { badge: 'bg-blue-100 text-blue-700 border-blue-200', bar: 'bg-blue-500' },
  premium: { badge: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-500' },
};

// Límites reales del pricing
const PLAN_LIMITS = {
  basico: { torneo: 2, cancha: 2, jugador: 100 },
  pro:    { torneo: 5, cancha: 6, jugador: 500 },
  premium: { torneo: -1, cancha: -1, jugador: -1 },
};

const PLAN_FEATURES = {
  basico: [
    { label: 'Canchas', value: 'Hasta 2' },
    { label: 'Torneos simultáneos', value: 'Máximo 2' },
    { label: 'Jugadores activos', value: 'Hasta 100' },
    { label: 'Partidos en vivo', value: '✗ No disponible', negative: true },
    { label: 'PDF export', value: 'Básico (Cuadro/Cronograma)' },
  ],
  pro: [
    { label: 'Canchas', value: 'Hasta 6' },
    { label: 'Torneos simultáneos', value: 'Máximo 5' },
    { label: 'Jugadores activos', value: 'Hasta 500' },
    { label: 'Partidos en vivo', value: '✗ No disponible', negative: true },
    { label: 'PDF export', value: 'Logo del club personalizado' },
  ],
  premium: [
    { label: 'Canchas', value: 'Ilimitadas' },
    { label: 'Torneos simultáneos', value: 'Ilimitados' },
    { label: 'Jugadores activos', value: 'Ilimitados' },
    { label: 'Partidos en vivo', value: '✓ Full Live Streaming/Scores' },
    { label: 'PDF export', value: 'Exportación Masiva · QR Live' },
  ],
};

function UsageBar({ label, current, limit, barColor, loading = false }) {
  if (loading) {
    return (
      <div className="mb-4 animate-pulse">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm text-gray-300">cargando…</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full" />
      </div>
    );
  }
  if (limit === -1) {
    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm text-amber-600 font-semibold">ilimitado ✓</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full w-full bg-amber-400 rounded-full" />
        </div>
      </div>
    );
  }

  const pct = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  const isNearLimit = pct >= 80;
  const isAtLimit = current >= limit;

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-semibold ${isAtLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : 'text-gray-500'}`}>
          {current} / {limit}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isAtLimit && (
        <p className="text-xs text-red-500 mt-1">Límite alcanzado — actualizá tu plan para agregar más.</p>
      )}
    </div>
  );
}

/**
 * MiPlan — sección de uso del plan y upgrade.
 *
 * Props:
 *   canchasCount  {number} - canchas activas del club
 *   torneosCount  {number} - torneos del club
 */
export default function MiPlan({ canchasCount = 0, torneosCount = 0 }) {
  const { clubPlan = 'basico', clubId } = useClub();
  const [jugadoresCount, setJugadoresCount] = useState(null);

  useEffect(() => {
    if (!clubId) return;
    axios.get('/api/perfil/count', { params: { club_id: clubId } })
      .then(({ data }) => setJugadoresCount(data.count ?? 0))
      .catch(() => setJugadoresCount(null));
  }, [clubId]);

  const planLabel = PLAN_LABELS[clubPlan] || clubPlan;
  const colors = PLAN_COLORS[clubPlan] || PLAN_COLORS.basico;
  const limits = PLAN_LIMITS[clubPlan] || PLAN_LIMITS.basico;
  const isPremium = clubPlan === 'premium';
  const features = PLAN_FEATURES[clubPlan] || PLAN_FEATURES.basico;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
      {/* Plan badge */}
      <div className="flex items-center gap-3">
        <div className={`px-4 py-1.5 rounded-full border text-sm font-bold tracking-wide ${colors.badge}`}>
          ⭐ Plan {planLabel}
        </div>
        {isPremium && (
          <span className="text-xs text-amber-600 font-medium">Plan activo con todas las funciones</span>
        )}
      </div>

      {/* Usage card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-5">Uso del plan</h3>

        <UsageBar label="Torneos" current={torneosCount} limit={limits.torneo} barColor={colors.bar} />
        <UsageBar label="Canchas" current={canchasCount} limit={limits.cancha} barColor={colors.bar} />
        <UsageBar
          label="Jugadores activos"
          current={jugadoresCount ?? 0}
          limit={limits.jugador}
          barColor={colors.bar}
          loading={jugadoresCount === null}
        />
      </div>

      {/* Plan features table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50">
          <h3 className="text-base font-semibold text-gray-800">Tu plan incluye</h3>
        </div>
        <ul className="divide-y divide-gray-50">
          {features.map((f) => (
            <li key={f.label} className="flex items-center justify-between px-6 py-3">
              <span className="text-sm text-gray-500">{f.label}</span>
              <span className={`text-sm font-medium ${f.negative ? 'text-red-400' : 'text-gray-800'}`}>{f.value}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Upgrade section */}
      {!isPremium && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6">
          <h3 className="font-semibold text-amber-800 mb-1">
            {clubPlan === 'basico' ? '¿Necesitás más capacidad? Pasate a Pro' : 'Desbloqueá todo con Premium'}
          </h3>
          <p className="text-amber-700 text-sm mb-4">
            {clubPlan === 'basico'
              ? 'Con Pro gestionás hasta 5 torneos, 6 canchas y 500 jugadores.'
              : 'Con Premium obtenés todo ilimitado, partidos en vivo y branding propio.'}
          </p>

          <ul className="space-y-1.5 mb-5">
            {clubPlan === 'basico' ? (
              <>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> Hasta 6 canchas · 5 torneos simultáneos</li>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> Hasta 500 jugadores activos</li>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> PDF con logo del club</li>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> Sin publicidad de SetGo</li>
              </>
            ) : (
              <>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> Torneos, canchas y jugadores ilimitados</li>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> Control en vivo · Full Live Streaming</li>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> White Label (Tu propia marca)</li>
                <li className="flex items-center gap-2 text-amber-700 text-sm"><span className="text-green-500">✓</span> Exportación masiva + QR Live</li>
              </>
            )}
          </ul>

          <button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 rounded-xl transition-all shadow-md shadow-amber-200">
            {clubPlan === 'basico' ? 'Actualizar a Pro' : 'Actualizar a Premium'}
          </button>
        </div>
      )}

      {isPremium && (
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-5 text-center">
          <p className="text-2xl mb-1">🏆</p>
          <p className="font-semibold text-amber-800">Estás en el plan máximo</p>
          <p className="text-amber-600 text-sm mt-1">Tenés acceso a todas las funciones de SetGo.</p>
        </div>
      )}
    </div>
  );
}
