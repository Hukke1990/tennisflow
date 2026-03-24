import { useState, useEffect } from 'react';

const PLAN_LABELS = {
  basico: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
};

const UPGRADE_PATH = {
  basico: 'pro',
  pro: 'premium',
};

const RESOURCE_LABELS = {
  torneo: 'torneos',
  cancha: 'canchas',
  jugador: 'jugadores activos',
  live_scoring: 'Control en Vivo',
};

const PLAN_FEATURES = {
  pro: [
    'Hasta 6 canchas registradas',
    'Hasta 5 torneos simultáneos',
    'Hasta 500 jugadores activos',
    'PDF con logo del club',
    'Sin publicidad de SetGo',
  ],
  premium: [
    'Canchas, torneos y jugadores ilimitados',
    'Control en vivo · Full Live Streaming',
    'White Label (Tu propia marca)',
    'Exportación masiva + QR Live',
  ],
};

export default function PlanLimitModal({ open, resource, plan, limit, current, onClose }) {
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) setVisible(true);
  }, [open]);

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  if (!visible && !open) return null;

  const upgradePlan = UPGRADE_PATH[plan] || 'premium';
  const upgradePlanLabel = PLAN_LABELS[upgradePlan] || upgradePlan;
  const resourceLabel = RESOURCE_LABELS[resource] || resource;
  const currentPlanLabel = PLAN_LABELS[plan] || plan;
  const features = PLAN_FEATURES[upgradePlan] || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-limit-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 pt-6 pb-8 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest opacity-80">
              Plan {currentPlanLabel}
            </span>
            <button
              onClick={handleClose}
              className="text-white/70 hover:text-white transition-colors text-xl leading-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <h2 id="plan-limit-title" className="text-2xl font-bold">
            {resource === 'live_scoring'
              ? 'Función exclusiva Premium'
              : `Límite de ${resourceLabel} alcanzado`}
          </h2>
          <p className="text-white/80 mt-1 text-sm">
            {resource === 'live_scoring'
              ? 'El Control en Vivo es una función exclusiva del plan Premium.'
              : `Ya tenés ${current} de ${limit} ${resourceLabel} en tu plan actual.`}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <p className="text-amber-800 text-sm font-medium">
              Con el plan <span className="font-bold">{upgradePlanLabel}</span> obtenés:
            </p>
            <ul className="mt-2 space-y-1">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-amber-700 text-sm">
                  <span className="text-green-500">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleClose}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 rounded-xl transition-all shadow-md shadow-amber-200"
            >
              ⭐ Actualizar a {upgradePlanLabel}
            </button>
            <button
              onClick={handleClose}
              className="w-full text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
