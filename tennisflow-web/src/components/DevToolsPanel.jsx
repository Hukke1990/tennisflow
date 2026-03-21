import React, { useState } from 'react';
import axios from 'axios';
import { supabase } from '../lib/supabase';
import { useClub } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';

function StepIcon({ status }) {
  if (status === 'loading') {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-black">
        ✓
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-xs font-black">
        ✕
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0" />;
}

export default function DevToolsPanel() {
  const { rolReal } = useAuth();
  const { clubId } = useClub();
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState([]);
  const [toast, setToast] = useState(null);

  // Seguridad estricta: solo super_admin
  if (rolReal !== 'super_admin') return null;

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 6000);
  };

  const appendStep = (label) => {
    setSteps((prev) => [...prev, { label, status: 'loading', note: '' }]);
  };

  const markLastStep = (status, note = '') => {
    setSteps((prev) => {
      const copy = [...prev];
      if (copy.length > 0) {
        copy[copy.length - 1] = { ...copy[copy.length - 1], status, note };
      }
      return copy;
    });
  };

  const handleGenerarTorneoCompleto = async () => {
    const confirmed = window.confirm(
      '¿Estás seguro? Esto cargará 64 jugadores y un torneo completo en este club.',
    );
    if (!confirmed) return;

    if (!clubId) {
      showToast('No se pudo obtener el club actual.', 'error');
      return;
    }

    setLoading(true);
    setSteps([]);

    try {
      // Paso 1: Crear torneo
      appendStep('Creando torneo de prueba...');
      const { data: torneoId, error: e1 } = await supabase.rpc('crear_torneo_test', {
        p_club_id: clubId,
        p_rama: 'Caballeros',
        p_categoria: 1,
        p_cupos: 32,
      });
      if (e1) throw new Error(`Error al crear torneo: ${e1.message}`);
      markLastStep('done', `ID: ${String(torneoId).slice(0, 8)}…`);

      // Paso 2: Generar jugadores
      appendStep('Generando 64 jugadores con nombres reales...');
      const { error: e2 } = await supabase.rpc('generar_jugadores_test', {
        p_club_id: clubId,
        p_cantidad: 32,
      });
      if (e2) throw new Error(`Error al generar jugadores: ${e2.message}`);
      markLastStep('done', '32 masculinos + 32 femeninos');

      // Paso 3: Inscribir jugadores
      appendStep('Inscribiendo jugadores en el torneo...');
      const { data: inscriptos, error: e3 } = await supabase.rpc('inscribir_jugadores_test', {
        p_torneo_id: torneoId,
        p_club_id: clubId,
      });
      if (e3) throw new Error(`Error al inscribir jugadores: ${e3.message}`);
      markLastStep('done', `${inscriptos} jugadores inscriptos`);

      // Paso 4: Ejecutar sorteo vía API
      appendStep('Ejecutando sorteo automático...');
      await axios.post(`/api/torneos/${torneoId}/sorteo`);
      markLastStep('done', 'Cuadro generado');

      // Paso 5: Autocompletar resultados
      appendStep('Completando resultados aleatorios...');
      const { data: resultado, error: e5 } = await supabase.rpc('autocompletar_cuadro_test', {
        p_torneo_id: torneoId,
      });
      if (e5) throw new Error(`Error al completar el cuadro: ${e5.message}`);
      markLastStep('done', resultado || 'Completado');

      showToast('¡Torneo de prueba generado con éxito!', 'ok');
    } catch (err) {
      markLastStep('error', err.message || 'Error desconocido');
      showToast(err.message || 'Error desconocido', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-5">
      {/* Cabecera de advertencia */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl" aria-hidden="true">🛠️</span>
          <h2 className="text-xl font-black text-amber-300">Herramientas de Desarrollador</h2>
          <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-xs font-black uppercase tracking-widest text-amber-400">
            Solo super_admin
          </span>
        </div>
        <p className="mt-2 pl-11 text-sm text-amber-200/60">
          Estas herramientas modifican la base de datos directamente. Úsalas únicamente en entornos de
          prueba o staging.
        </p>
      </div>

      {/* Tarjeta principal */}
      <div className="rounded-2xl border border-white/10 bg-[#0d1d35] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          {/* Descripción */}
          <div className="flex-1 space-y-1">
            <p className="text-white font-black text-base">
              Generar Torneo de Prueba Completo (64 Jugadores)
            </p>
            <p className="text-white/50 text-sm">
              Ejecuta en secuencia las funciones SQL de automatización:
            </p>
            <ol className="mt-2 space-y-0.5 text-xs text-white/40 list-decimal list-inside">
              <li>
                <code className="text-amber-300/70">crear_torneo_test</code>
                {' — '}torneo Singles Caballeros Cat.1 (32 cupos)
              </li>
              <li>
                <code className="text-amber-300/70">generar_jugadores_test</code>
                {' — '}32 masculinos + 32 femeninos con nombres reales
              </li>
              <li>
                <code className="text-amber-300/70">inscribir_jugadores_test</code>
                {' — '}inscribe los jugadores al torneo creado
              </li>
              <li>
                <span className="text-amber-300/70">POST /api/torneos/:id/sorteo</span>
                {' — '}genera el cuadro oficial
              </li>
              <li>
                <code className="text-amber-300/70">autocompletar_cuadro_test</code>
                {' — '}simula resultados aleatorios hasta el campeón
              </li>
            </ol>
          </div>

          {/* Botón */}
          <button
            type="button"
            onClick={handleGenerarTorneoCompleto}
            disabled={loading || !clubId}
            className="shrink-0 flex items-center gap-2 rounded-xl border border-amber-400/50
              bg-amber-500/20 px-5 py-3 text-sm font-black text-amber-300
              hover:bg-amber-500/30 hover:border-amber-400/80
              disabled:cursor-not-allowed disabled:opacity-40
              transition-all duration-150 self-start"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                Generando…
              </>
            ) : (
              <>
                <span aria-hidden="true">⚡</span>
                Generar Torneo de Prueba Completo (64 Jugadores)
              </>
            )}
          </button>
        </div>

        {/* Progreso paso a paso */}
        {steps.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2.5">
            {steps.map((step, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="flex items-start gap-3">
                <StepIcon status={step.status} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${
                    step.status === 'done'    ? 'text-emerald-300' :
                    step.status === 'error'   ? 'text-red-300'     :
                    step.status === 'loading' ? 'text-amber-300'   : 'text-white/50'
                  }`}>
                    {step.label}
                  </p>
                  {step.note && (
                    <p className="text-xs text-white/40 mt-0.5 truncate">{step.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast de notificación */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border
          px-5 py-3 shadow-2xl backdrop-blur-md ${
            toast.type === 'error'
              ? 'border-red-400/40 bg-red-500/20 text-red-300'
              : 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
          }`}
        >
          <span className="text-sm font-black">{toast.msg}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-lg leading-none opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}
    </section>
  );
}
