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
  const { clubPlan = 'basico', clubId, clubSlug } = useClub();
  const [jugadoresCount, setJugadoresCount] = useState(null);

  // Estado de suscripción desde el backend
  const [suscripcion, setSuscripcion] = useState(null);   // objeto suscripcion o null
  const [suscripcionActiva, setSuscripcionActiva] = useState(false);
  const [suscripcionLoading, setSuscripcionLoading] = useState(false);
  const [suscripcionError, setSuscripcionError] = useState(null);

  // Estados del flujo de upgrade
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState(null);

  // Modal de cancelación
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    if (!clubId) return;
    axios.get('/api/perfil/count', { params: { club_id: clubId } })
      .then(({ data }) => setJugadoresCount(data.count ?? 0))
      .catch(() => setJugadoresCount(null));
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;
    setSuscripcionLoading(true);
    setSuscripcionError(null);
    axios.get('/api/suscripciones/estado')
      .then(({ data }) => {
        setSuscripcion(data.suscripcion);
        setSuscripcionActiva(data.activa);
      })
      .catch(() => setSuscripcionError('No se pudo cargar el estado de la suscripción.'))
      .finally(() => setSuscripcionLoading(false));
  }, [clubId]);

  const handleUpgrade = async (planType) => {
    setUpgradeLoading(true);
    setUpgradeError(null);
    try {
      const { data } = await axios.post('/api/suscripciones/iniciar', { plan_type: planType });
      if (!data?.init_point) throw new Error('No se recibió la URL de pago de Mercado Pago.');
      window.location.href = data.init_point;
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Error inesperado al iniciar la suscripción.';
      setUpgradeError(msg);
      setUpgradeLoading(false);
    }
  };

  const handleCancelar = async () => {
    setCancelLoading(true);
    setCancelError(null);
    try {
      await axios.post('/api/suscripciones/cancelar');
      setCancelModal(false);
      setSuscripcion(null);
      setSuscripcionActiva(false);
    } catch (err) {
      setCancelError(err.response?.data?.error || 'Error al cancelar la suscripción.');
    } finally {
      setCancelLoading(false);
    }
  };

  const planLabel = PLAN_LABELS[clubPlan] || clubPlan;
  const colors = PLAN_COLORS[clubPlan] || PLAN_COLORS.basico;
  const limits = PLAN_LIMITS[clubPlan] || PLAN_LIMITS.basico;
  const isPremium = clubPlan === 'premium';
  const features = PLAN_FEATURES[clubPlan] || PLAN_FEATURES.basico;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
      {/* Plan badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`px-4 py-1.5 rounded-full border text-sm font-bold tracking-wide ${colors.badge}`}>
          ⭐ Plan {planLabel}
        </div>
        {isPremium && (
          <span className="text-xs text-amber-600 font-medium">Plan activo con todas las funciones</span>
        )}
        {suscripcion?.status === 'paused' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 border border-red-200 text-red-700 text-xs font-bold">
            ⚠️ Suscripción pausada — actualizá tu método de pago
          </span>
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

          {upgradeError && (
            <p className="text-red-600 text-xs mb-3">{upgradeError}</p>
          )}

          {suscripcionActiva ? (
            /* Ya tiene una suscripción activa en este plan */
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-3 px-4 text-center">
                <p className="text-emerald-700 text-sm font-semibold">✓ Suscripción activa</p>
                {suscripcion?.next_payment_date && (
                  <p className="text-emerald-600 text-xs mt-0.5">
                    Próximo cobro: {new Date(suscripcion.next_payment_date).toLocaleDateString('es-AR')}
                  </p>
                )}
              </div>
              <a
                href="https://www.mercadopago.com.ar/subscriptions"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 rounded-xl transition-all shadow-md shadow-amber-200 text-sm"
              >
                🔧 Gestionar Suscripción
              </a>
              <button
                type="button"
                onClick={() => setCancelModal(true)}
                className="w-full text-red-500 hover:text-red-700 text-sm font-medium py-2 border border-red-200 hover:border-red-300 rounded-xl transition-colors"
              >
                Cancelar suscripción
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={upgradeLoading}
              onClick={() => handleUpgrade(clubPlan === 'basico' ? 'pro' : 'premium')}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-md shadow-amber-200"
            >
              {upgradeLoading
                ? 'Redirigiendo a Mercado Pago…'
                : (clubPlan === 'basico' ? 'Actualizar a Pro' : 'Actualizar a Premium')}
            </button>
          )}
        </div>
      )}

      {isPremium && (
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-5 text-center space-y-4">
          <p className="text-2xl mb-1">🏆</p>
          <p className="font-semibold text-amber-800">Estás en el plan máximo</p>
          <p className="text-amber-600 text-sm mt-1">Tenés acceso a todas las funciones de SetGo.</p>

          {suscripcionActiva ? (
            <div className="space-y-2">
              {suscripcion?.next_payment_date && (
                <p className="text-amber-700 text-xs">
                  Próximo cobro: {new Date(suscripcion.next_payment_date).toLocaleDateString('es-AR')}
                </p>
              )}
              <a
                href="https://www.mercadopago.com.ar/subscriptions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors shadow-md shadow-amber-200"
              >
                🔧 Gestionar Suscripción
              </a>
              <br />
              <button
                type="button"
                onClick={() => setCancelModal(true)}
                className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
              >
                Cancelar suscripción
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={upgradeLoading}
              onClick={() => handleUpgrade('premium')}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow-md shadow-amber-200"
            >
              {upgradeLoading ? 'Redirigiendo…' : 'Activar suscripción Grand Slam'}
            </button>
          )}
        </div>
      )}

      {/* Modal de confirmación de cancelación */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-7 max-w-sm w-full text-center space-y-4">
            <p className="text-3xl">⚠️</p>
            <h3 className="text-lg font-bold text-gray-900">¿Cancelar la suscripción?</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Tu plan pasará a <strong>Básico</strong> al finalizar el período actual.
              Perderás el acceso a las funciones avanzadas.
            </p>
            {cancelError && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg py-2 px-3">{cancelError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setCancelModal(false); setCancelError(null); }}
                disabled={cancelLoading}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                Mantener plan
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                disabled={cancelLoading}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {cancelLoading ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}