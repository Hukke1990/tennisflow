import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL ?? '';

// ── Pantalla de éxito con polling ─────────────────────────────────────────────
function PagoExitoScreen({ clubId, clubNombre }) {
  const [estado, setEstado] = useState('verificando'); // 'verificando' | 'activo' | 'timeout'
  const [slug, setSlug]     = useState(null);
  const intentos = useRef(0);
  const MAX_INTENTOS = 20; // ~40 segundos

  useEffect(() => {
    const intervalo = setInterval(async () => {
      intentos.current += 1;
      try {
        const res  = await fetch(`${API}/api/activar/${clubId}/verificar`);
        const data = await res.json();
        if (data.is_active) {
          setSlug(data.slug);
          setEstado('activo');
          clearInterval(intervalo);
          return;
        }
      } catch (_) { /* seguir intentando */ }

      if (intentos.current >= MAX_INTENTOS) {
        setEstado('timeout');
        clearInterval(intervalo);
      }
    }, 2000);

    return () => clearInterval(intervalo);
  }, [clubId]);

  if (estado === 'activo') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-3xl">
            🎾
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">¡Club activado!</h2>
          <p className="text-slate-400 mb-6">
            <span className="text-white font-medium">{clubNombre}</span> ya está listo para usar.
          </p>
          {slug && (
            <a
              href={`/${slug}/login`}
              className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Ingresar al club
            </a>
          )}
        </div>
      </div>
    );
  }

  if (estado === 'timeout') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-3xl mb-4">⏳</div>
          <h2 className="text-white text-xl font-semibold mb-2">Pago en proceso</h2>
          <p className="text-slate-400 mb-2">
            El pago fue recibido pero la activación está tardando más de lo esperado.
          </p>
          <p className="text-slate-500 text-sm mb-6">
            En unos minutos tu club estará activo. Si el problema persiste, contactá soporte.
          </p>
          <button
            type="button"
            onClick={() => { intentos.current = 0; setEstado('verificando'); }}
            className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 py-2 px-6 rounded-lg transition-colors text-sm"
          >
            Reintentar verificación
          </button>
        </div>
      </div>
    );
  }

  // Verificando...
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-10 h-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto mb-4" />
        <h2 className="text-white text-xl font-semibold mb-2">Verificando pago…</h2>
        <p className="text-slate-400 text-sm">
          Confirmando con Mercado Pago que el pago fue exitoso. Esto tarda unos segundos.
        </p>
      </div>
    </div>
  );
}

const PLANES = [
  {
    id: 'basico',
    label: 'Básico',
    usd: 30,
    features: ['Torneos ilimitados', 'Hasta 64 jugadores', 'Cuadro automático'],
  },
  {
    id: 'pro',
    label: 'Pro',
    usd: 50,
    features: ['Todo lo de Básico', 'Rankings ELO', 'Estadísticas avanzadas'],
  },
  {
    id: 'premium',
    label: 'Grand Slam',
    usd: 70,
    features: ['Todo lo de Pro', 'White label', 'Soporte prioritario'],
  },
  {
    id: 'test',
    label: '⚠️ Test (15 ARS)',
    usd: null,
    ars_override: 15,
    features: ['Solo para pruebas', 'Todas las funciones', 'Eliminar antes de producción'],
  },
];

export default function ActivarClubPage() {
  const { clubId }          = useParams();
  const [searchParams]      = useSearchParams();
  const pagoExito           = searchParams.get('pago') === 'exito';

  const [club, setClub]         = useState(null);
  const [cotizacion, setCoti]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [planSel, setPlanSel]   = useState(null);
  const [paying, setPaying]     = useState(false);
  const [payError, setPayError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [clubRes, cotiRes] = await Promise.all([
        fetch(`${API}/api/activar/${clubId}`),
        fetch(`${API}/api/suscripciones/cotizacion`),
      ]);
      if (!clubRes.ok) {
        const { error: e } = await clubRes.json().catch(() => ({}));
        throw new Error(e || 'Club no encontrado');
      }
      const [clubData, cotiData] = await Promise.all([clubRes.json(), cotiRes.json()]);
      setClub(clubData);
      if (cotiData?.cotizacion) setCoti(cotiData.cotizacion);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePagar = async () => {
    if (!planSel) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch(`${API}/api/activar/${clubId}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_type: planSel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(' | ')|| 'Error al iniciar el pago');
      if (data.init_point) window.location.href = data.init_point;
    } catch (e) {
      setPayError(e.message);
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-400 text-lg font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (club?.is_active) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">{club.nombre}</h2>
          <p className="text-slate-400 mb-6">Este club ya está activo.</p>
          <a
            href={`/${club.slug}/login`}
            className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Ir al login
          </a>
        </div>
      </div>
    );
  }

  if (pagoExito) {
    return <PagoExitoScreen clubId={clubId} clubNombre={club?.nombre} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-bold mb-2">Activá tu club</h1>
          <p className="text-slate-400 text-lg">
            <span className="text-emerald-400 font-medium">{club?.nombre}</span> — Elegí el plan
            que mejor se adapte a vos
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PLANES.map((p) => {
            const ars = p.ars_override ?? (cotizacion && p.usd ? Math.round(p.usd * cotizacion) : null);
            const selected = planSel === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanSel(p.id)}
                className={`rounded-2xl p-6 border text-left transition-all ${
                  selected
                    ? 'bg-emerald-600/20 border-emerald-500 ring-2 ring-emerald-500'
                    : 'bg-slate-900 border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-semibold text-lg">{p.label}</span>
                  {selected && (
                    <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-xs text-white">
                      ✓
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  {p.ars_override != null ? (
                    <><span className="text-3xl font-bold text-white">${p.ars_override}</span>
                    <span className="text-slate-400 text-sm ml-1">ARS/mes</span></>
                  ) : (
                    <><span className="text-3xl font-bold text-white">${p.usd}</span>
                    <span className="text-slate-400 text-sm ml-1">USD/mes</span>
                    {ars && (
                      <p className="text-slate-500 text-xs mt-1">
                        ≈ ${ars.toLocaleString('es-AR')} ARS
                      </p>
                    )}</>
                  )}
                </div>
                <ul className="space-y-1">
                  {p.features.map((f) => (
                    <li key={f} className="text-slate-400 text-sm flex items-center gap-2">
                      <span className="text-emerald-500">•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {payError && (
          <p className="text-red-400 text-sm text-center mb-4">{payError}</p>
        )}

        <div className="text-center">
          <button
            type="button"
            disabled={!planSel || paying}
            onClick={handlePagar}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-10 rounded-xl transition-colors text-lg"
          >
            {paying ? 'Redirigiendo...' : 'Ir al pago'}
          </button>
          {!planSel && (
            <p className="text-slate-500 text-sm mt-2">Seleccioná un plan para continuar</p>
          )}
        </div>
      </div>
    </div>
  );
}
