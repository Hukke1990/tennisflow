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

const COLORS = {
  amber: {
    btn: 'border-amber-400/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:border-amber-400/80',
    spin: 'border-amber-400',
  },
  blue: {
    btn: 'border-blue-400/50 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:border-blue-400/80',
    spin: 'border-blue-400',
  },
};

function ScenarioCard({ title, description, steps, runningSteps, onRun, loading, disabled, btnLabel, btnColor = 'amber' }) {
  const c = COLORS[btnColor] || COLORS.amber;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1d35] p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <div className="flex-1 space-y-1">
          <p className="text-white font-black text-base">{title}</p>
          <p className="text-white/50 text-sm">{description}</p>
          <ol className="mt-2 space-y-0.5 text-xs text-white/40 list-decimal list-inside">
            {steps.map((s) => (
              <li key={s.code}>
                <code className="text-amber-300/70">{s.code}</code>{' — '}{s.desc}
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={loading || disabled}
          className={`shrink-0 self-start flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-black
            disabled:cursor-not-allowed disabled:opacity-40 transition-all duration-150 ${c.btn}`}
        >
          {loading ? (
            <>
              <span className={`h-4 w-4 animate-spin rounded-full border-2 border-t-transparent ${c.spin}`} />
              Generando…
            </>
          ) : (
            <><span aria-hidden="true">⚡</span>{btnLabel}</>
          )}
        </button>
      </div>
      {runningSteps.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2.5">
          {runningSteps.map((step, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className="flex items-start gap-3">
              <StepIcon status={step.status} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  step.status === 'done'    ? 'text-emerald-300' :
                  step.status === 'error'   ? 'text-red-300'     :
                  step.status === 'loading' ? 'text-amber-300'   : 'text-white/50'
                }`}>{step.label}</p>
                {step.note && <p className="text-xs text-white/40 mt-0.5 truncate">{step.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DevToolsPanel() {
  const { rolReal } = useAuth();
  const { clubId } = useClub();
  const [loading, setLoading] = useState(false);
  const [loadingManual, setLoadingManual] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [stepsManual, setStepsManual] = useState([]);
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

  const handleLimpiar = async () => {
    const confirmed = window.confirm(
      '¿Eliminar TODOS los datos [TEST] de este club? (torneos, jugadores y canchas de prueba)',
    );
    if (!confirmed) return;
    if (!clubId) { showToast('No se pudo obtener el club actual.', 'error'); return; }

    setCleaning(true);
    try {
      const { data, error } = await supabase.rpc('limpiar_test', { p_club_id: clubId });
      if (error) throw new Error(error.message);
      setSteps([]);
      showToast(data || 'Datos de prueba eliminados.', 'ok');
    } catch (err) {
      showToast(err.message || 'Error al limpiar.', 'error');
    } finally {
      setCleaning(false);
    }
  };

  const handleGenerarTorneoManual = async () => {
    const confirmed = window.confirm(
      '¿Estás seguro? Esto cargará 64 jugadores y un torneo abierto listo para completar manualmente.',
    );
    if (!confirmed) return;
    if (!clubId) { showToast('No se pudo obtener el club actual.', 'error'); return; }

    setLoadingManual(true);
    setStepsManual([]);

    const appendManual = (label) =>
      setStepsManual((prev) => [...prev, { label, status: 'loading', note: '' }]);
    const markManual = (status, note = '') =>
      setStepsManual((prev) => {
        const copy = [...prev];
        if (copy.length > 0) copy[copy.length - 1] = { ...copy[copy.length - 1], status, note };
        return copy;
      });

    try {
      appendManual('Creando torneo de prueba...');
      const { data: torneoId, error: e1 } = await supabase.rpc('crear_torneo_test', {
        p_club_id: clubId, p_rama: 'Masculino', p_categoria: 1, p_cupos: 32,
      });
      if (e1) throw new Error(`Error al crear torneo: ${e1.message}`);
      markManual('done', `ID: ${String(torneoId).slice(0, 8)}…`);

      appendManual('Generando 64 jugadores con nombres reales...');
      const { error: e2 } = await supabase.rpc('generar_jugadores_test', {
        p_club_id: clubId, p_cantidad: 32,
      });
      if (e2) throw new Error(`Error al generar jugadores: ${e2.message}`);
      markManual('done', '32 masculinos + 32 femeninos');

      appendManual('Inscribiendo jugadores en el torneo...');
      const { data: inscriptos, error: e3 } = await supabase.rpc('inscribir_jugadores_test', {
        p_torneo_id: torneoId, p_club_id: clubId,
      });
      if (e3) throw new Error(`Error al inscribir jugadores: ${e3.message}`);
      markManual('done', `${inscriptos} jugadores inscriptos`);

      appendManual('Ejecutando sorteo automático...');
      await axios.post(`/api/torneos/${torneoId}/sorteo`);
      markManual('done', 'Cuadro generado — listo para completar manualmente');

      showToast('¡Torneo listo para prueba manual!', 'ok');
    } catch (err) {
      markManual('error', err.message || 'Error desconocido');
      showToast(err.message || 'Error desconocido', 'error');
    } finally {
      setLoadingManual(false);
    }
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
        p_rama: 'Masculino',
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

      {/* Tarjeta: prueba manual */}
      <ScenarioCard
        title="Torneo Abierto para Prueba Manual (64 Jugadores)"
        description="Crea el torneo, genera jugadores, los inscribe y sortea el cuadro. No completa resultados — podés jugarlos manualmente desde la app."
        steps={[
          { code: 'crear_torneo_test', desc: 'torneo Singles Caballeros Cat.1' },
          { code: 'generar_jugadores_test', desc: '32 masculinos + 32 femeninos' },
          { code: 'inscribir_jugadores_test', desc: 'inscribe al torneo' },
          { code: 'POST /api/torneos/:id/sorteo', desc: 'genera el cuadro — sin autocompletar' },
        ]}
        runningSteps={stepsManual}
        onRun={handleGenerarTorneoManual}
        loading={loadingManual}
        disabled={loading || cleaning || !clubId}
        btnLabel="Generar Torneo Manual (64 Jugadores)"
        btnColor="blue"
      />

      {/* Tarjeta: torneo completo */}
      <ScenarioCard
        title="Torneo Completo con Resultados Simulados (64 Jugadores)"
        description="Ejecuta todo el flujo automáticamente: crea torneo, genera jugadores, sortea el cuadro y simula resultados hasta el campeón."
        steps={[
          { code: 'crear_torneo_test', desc: 'torneo Singles Caballeros Cat.1' },
          { code: 'generar_jugadores_test', desc: '32 masculinos + 32 femeninos' },
          { code: 'inscribir_jugadores_test', desc: 'inscribe al torneo' },
          { code: 'POST /api/torneos/:id/sorteo', desc: 'genera el cuadro oficial' },
          { code: 'autocompletar_cuadro_test', desc: 'simula resultados hasta el campeón' },
        ]}
        runningSteps={steps}
        onRun={handleGenerarTorneoCompleto}
        loading={loading}
        disabled={loadingManual || cleaning || !clubId}
        btnLabel="Generar Torneo Completo (64 Jugadores)"
        btnColor="amber"
      />

      {/* Botón limpiar */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleLimpiar}
          disabled={loading || loadingManual || cleaning || !clubId}
          className="flex items-center gap-2 rounded-xl border border-red-500/40
            bg-red-500/10 px-5 py-3 text-sm font-black text-red-400
            hover:bg-red-500/20 hover:border-red-500/60
            disabled:cursor-not-allowed disabled:opacity-40
            transition-all duration-150"
        >
          {cleaning ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
              Limpiando…
            </>
          ) : (
            <><span aria-hidden="true">🗑️</span> Eliminar Datos de Prueba [TEST]</>
          )}
        </button>
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
