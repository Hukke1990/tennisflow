/**
 * PlanesModal — comparativa detallada de planes Básico / Pro / Premium.
 * Resalta el plan activo del club.
 */
import { useState } from 'react';
import axios from 'axios';
import { useClub } from '../context/ClubContext';

const PLANES = [
  {
    id: 'basico',
    nombre: 'Básico',
    enfoque: 'Clubes pequeños / Torneos sociales',
    color: 'border-gray-600',
    headerBg: 'bg-gray-800',
    badgeBg: 'bg-gray-700 text-gray-200',
    activeBadge: 'bg-[#A6CE39] text-[#0a0f1e]',
    activeRing: 'ring-2 ring-[#A6CE39]',
    features: [
      { label: 'Canchas', value: 'Hasta 2' },
      { label: 'Torneos simultaneos', value: 'Máximo 2' },
      { label: 'Jugadores activos', value: 'Hasta 100' },
      { label: 'Partidos en vivo', value: 'No disponible', negative: true },
      { label: 'Soporte PDF', value: 'Básico (Cuadro/Cronograma)' },
    ],
  },
  {
    id: 'pro',
    nombre: 'Pro',
    enfoque: 'Clubes medianos en crecimiento',
    color: 'border-blue-500',
    headerBg: 'bg-blue-900/60',
    badgeBg: 'bg-blue-700 text-blue-100',
    activeBadge: 'bg-[#A6CE39] text-[#0a0f1e]',
    activeRing: 'ring-2 ring-[#A6CE39]',
    features: [
      { label: 'Canchas', value: 'Hasta 6' },
      { label: 'Torneos simultáneos', value: 'Máximo 5' },
      { label: 'Jugadores activos', value: 'Hasta 500' },
      { label: 'Partidos en vivo', value: 'No disponible', negative: true },
      { label: 'Soporte PDF', value: 'Personalizado con Logo Club' },
    ],
  },
  {
    id: 'premium',
    nombre: 'Premium',
    enfoque: 'Grandes centros / Circuitos Pro',
    color: 'border-amber-500',
    headerBg: 'bg-amber-900/40',
    badgeBg: 'bg-amber-600 text-amber-100',
    activeBadge: 'bg-[#A6CE39] text-[#0a0f1e]',
    activeRing: 'ring-2 ring-[#A6CE39]',
    features: [
      { label: 'Canchas', value: 'Ilimitadas' },
      { label: 'Torneos simultáneos', value: 'Ilimitados' },
      { label: 'Jugadores activos', value: 'Ilimitados' },
      { label: 'Partidos en vivo', value: '✓ Full Live Streaming/Scores' },
      { label: 'Soporte PDF', value: 'Exportación Masiva · QR Live' },
    ],
  },
];

export default function PlanesModal({ open, onClose }) {
  const { clubPlan = 'basico' } = useClub();
  const [loadingPlan, setLoadingPlan] = useState(null); // 'pro' | 'premium' | null
  const [upgradeError, setUpgradeError] = useState(null);

  const handleUpgrade = async (planId) => {
    setLoadingPlan(planId);
    setUpgradeError(null);
    try {
      const { data } = await axios.post('/api/suscripciones/iniciar', { plan_type: planId });
      if (!data?.init_point) throw new Error('No se recibió la URL de pago.');
      window.location.href = data.init_point;
    } catch (err) {
      setUpgradeError(err.response?.data?.error || err.message || 'Error al iniciar el pago.');
      setLoadingPlan(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planes-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-[#0d1426] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
          <div>
            <h2 id="planes-modal-title" className="text-xl font-bold text-white">
              Planes de SetGo
            </h2>
            <p className="text-gray-400 text-sm mt-0.5">
              Tu plan actual está destacado.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none p-1"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Planes grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
          {upgradeError && (
            <div className="col-span-full bg-red-900/40 border border-red-500/40 text-red-300 text-xs rounded-lg px-4 py-2 text-center">
              {upgradeError}
            </div>
          )}
          {PLANES.map((plan) => {
            const isActive = plan.id === clubPlan;
            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border bg-white/[0.03] flex flex-col overflow-hidden transition-all ${plan.color} ${isActive ? plan.activeRing : ''}`}
              >
                {/* Plan header */}
                <div className={`px-5 py-4 ${plan.headerBg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-bold text-lg">{plan.nombre}</span>
                    {isActive && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${plan.activeBadge}`}>
                        Tu plan
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs leading-snug">{plan.enfoque}</p>
                </div>

                {/* Features */}
                <ul className="flex-1 divide-y divide-white/5">
                  {plan.features.map((f) => (
                    <li key={f.label} className="flex items-start justify-between px-5 py-2.5 gap-3">
                      <span className="text-gray-400 text-xs">{f.label}</span>
                      <span className={`text-xs font-medium text-right shrink-0 max-w-[55%] ${f.negative ? 'text-red-400' : 'text-white'}`}>
                        {f.value}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="px-5 py-4 border-t border-white/5">
                  {isActive ? (
                    <div className="text-center text-xs text-[#A6CE39] font-medium py-1">
                      ✓ Plan activo
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={loadingPlan !== null}
                      className={`w-full py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 ${
                        plan.id === 'premium'
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-md shadow-amber-900/30'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {loadingPlan === plan.id ? 'Redirigiendo…' : `Actualizar a ${plan.nombre}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
