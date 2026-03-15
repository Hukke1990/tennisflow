import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { getInscripcionWindowState } from '../lib/inscripcionWindow';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconCheckCircle,
  IconClose,
  IconLock,
  IconSpark,
  IconXCircle,
} from './icons/UiIcons';
import { useClub } from '../context/ClubContext';

const API_URL = '';
const HORA_FULL_TIME_INICIO = '00:00';
const HORA_FULL_TIME_FIN = '23:59';
const ESTADOS_NO_INSCRIPCION = new Set(['borrador', 'cerrado', 'finalizado', 'cancelado', 'suspendido']);

const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

const parseIsoToUtcDateOnly = (value) => {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const toDateKey = (dateObj) => dateObj.toISOString().slice(0, 10);

const dateKeyToLabelDate = (dateKey) => {
  const [year, month, day] = String(dateKey || '').split('-').map((v) => Number.parseInt(v, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  // Mediodia local para evitar corrimientos visuales por zona horaria.
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const construirDiasTorneo = (fechaInicio, fechaFin) => {
  if (!fechaInicio) return [];

  const inicioDia = parseIsoToUtcDateOnly(fechaInicio);
  if (!inicioDia) return [];

  let finDia = fechaFin ? parseIsoToUtcDateOnly(fechaFin) : new Date(inicioDia);
  if (!finDia || finDia.getTime() < inicioDia.getTime()) {
    finDia = new Date(inicioDia);
  }

  const dias = [];

  for (let cursor = new Date(inicioDia.getTime()); cursor.getTime() <= finDia.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const fecha = toDateKey(cursor);
    const diaSemana = cursor.getUTCDay();
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
    const fechaLabel = dateKeyToLabelDate(fecha);

    dias.push({
      fecha,
      dia_semana: diaSemana,
      es_fin_de_semana: esFinDeSemana,
      label: fechaLabel
        ? capitalizar(format(fechaLabel, "EEEE d 'de' MMMM", { locale: es }))
        : fecha,
    });
  }

  return dias;
};

export default function InscripcionModal({ torneo, onClose, onSuccess }) {
  const { user } = useAuth();
  const { clubId } = useClub();
  const [perfil, setPerfil] = useState(null);
  const [franjas, setFranjas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parejaQuery, setParejaQuery] = useState('');
  const [parejaLoading, setParejaLoading] = useState(false);
  const [parejaOpciones, setParejaOpciones] = useState([]);
  const [parejaSeleccionada, setParejaSeleccionada] = useState(null);

  const modalidadNormalizada = useMemo(
    () => String(torneo?.modalidad || '').trim().toLowerCase(),
    [torneo?.modalidad]
  );
  const torneoEsDobles = modalidadNormalizada === 'dobles' || modalidadNormalizada === 'doubles' || modalidadNormalizada === 'double';

  const diasTorneo = useMemo(
    () => construirDiasTorneo(torneo?.fecha_inicio, torneo?.fecha_fin),
    [torneo?.fecha_inicio, torneo?.fecha_fin]
  );

  const diasEditables = useMemo(
    () => diasTorneo.filter((d) => !d.es_fin_de_semana),
    [diasTorneo]
  );

  const franjasObligatorias = useMemo(
    () => diasTorneo
      .filter((d) => d.es_fin_de_semana)
      .map((d) => ({
        fecha: d.fecha,
        dia_semana: d.dia_semana,
        hora_inicio: HORA_FULL_TIME_INICIO,
        hora_fin: HORA_FULL_TIME_FIN,
        es_obligatoria_fin_semana: true,
      })),
    [diasTorneo]
  );

  useEffect(() => {
    if (diasEditables.length === 0) {
      setFranjas([]);
      return;
    }

    setFranjas([
      {
        fecha: diasEditables[0].fecha,
        dia_semana: diasEditables[0].dia_semana,
        hora_inicio: '08:00',
        hora_fin: '10:00',
      },
    ]);
  }, [diasEditables]);

  useEffect(() => {
    if (!user?.id) return;
    axios.get(`${API_URL}/api/perfil/${user.id}`)
      .then(({ data }) => setPerfil(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    setParejaQuery('');
    setParejaOpciones([]);
    setParejaSeleccionada(null);
  }, [torneo?.id]);

  const categoriaPerfil = torneoEsDobles
    ? (perfil?.categoria_dobles ?? perfil?.categoria)
    : (perfil?.categoria_singles ?? perfil?.categoria);
  const perfilCompleto = Boolean(categoriaPerfil && perfil?.localidad);

  // Validar si el jugador cumple sexo y categoria del torneo
  const normalizarSexo = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'masculino' || s === 'm') return 'Masculino';
    if (s === 'femenino' || s === 'f') return 'Femenino';
    return null;
  };
  const ramaT = String(torneo?.rama || torneo?.sexo || '').trim();
  const categoriaT = torneo?.categoria_id != null ? Number(torneo.categoria_id) : null;
  const sexoPerfil = normalizarSexo(perfil?.sexo);
  const catPerfilNum = categoriaPerfil != null ? Number(categoriaPerfil) : null;
  const sexoOk = !ramaT || ramaT === 'Mixto' || sexoPerfil === ramaT;
  const catOk = categoriaT == null || catPerfilNum == null || catPerfilNum === categoriaT;
  const cumpleRequisitos = sexoOk && catOk;
  let mensajeRequisito = null;
  if (!sexoOk && !catOk) {
    mensajeRequisito = `Este torneo es para jugadores ${ramaT} de categoría ${categoriaT}. Tu perfil (${sexoPerfil || 'sin sexo'}, Cat ${catPerfilNum ?? '?'}) no cumple estos requisitos.`;
  } else if (!sexoOk) {
    mensajeRequisito = `Este torneo es exclusivo para la rama ${ramaT}. Tu perfil está registrado como ${sexoPerfil || 'sin sexo definido'}.`;
  } else if (!catOk) {
    mensajeRequisito = `Tu categoría (Cat ${catPerfilNum ?? '?'}) no coincide con la requerida por este torneo (Cat ${categoriaT}).`;
  }

  const estado = (torneo?.estado || '').toLowerCase();
  const bloqueadoPorEstado = ESTADOS_NO_INSCRIPCION.has(estado);
  const mensajeBloqueoEstado = estado === 'borrador'
    ? 'Este torneo aun esta en preparacion. Las inscripciones se habilitan cuando sea publicado.'
    : 'La inscripcion no esta disponible para el estado actual de este torneo.';
  const ventanaInscripcion = useMemo(
    () => getInscripcionWindowState(torneo),
    [torneo?.fecha_inicio_inscripcion, torneo?.fecha_cierre_inscripcion]
  );

  const franjasTotales = [...franjas, ...franjasObligatorias];

  useEffect(() => {
    if (!torneoEsDobles || !user?.id || !torneo?.id || !clubId) {
      setParejaOpciones([]);
      setParejaLoading(false);
      return;
    }

    const query = parejaQuery.trim();
    if (query.length < 2) {
      setParejaOpciones([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setParejaLoading(true);
      try {
        const { data } = await axios.get(`${API_URL}/api/torneos/${torneo.id}/companeros-disponibles`, {
          params: {
            club_id: clubId,
            jugador_id: user.id,
            q: query,
          },
        });

        if (!active) return;
        setParejaOpciones(Array.isArray(data) ? data : []);
      } catch (_) {
        if (!active) return;
        setParejaOpciones([]);
      } finally {
        if (active) setParejaLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [torneoEsDobles, parejaQuery, torneo?.id, user?.id, clubId]);

  const obtenerDiaPorFecha = (fecha) => diasTorneo.find((d) => d.fecha === fecha);

  const agregarFranja = () => {
    if (diasEditables.length === 0) return;
    setFranjas((prev) => [
      ...prev,
      {
        fecha: diasEditables[0].fecha,
        dia_semana: diasEditables[0].dia_semana,
        hora_inicio: '08:00',
        hora_fin: '10:00',
      },
    ]);
  };

  const quitarFranja = (i) =>
    setFranjas((prev) => prev.filter((_, idx) => idx !== i));

  const cambiar = (i, campo, val) => {
    setFranjas((prev) => prev.map((f, idx) => {
      if (idx !== i) return f;

      if (campo === 'fecha') {
        const diaSeleccionado = obtenerDiaPorFecha(val);
        return {
          ...f,
          fecha: val,
          dia_semana: diaSeleccionado?.dia_semana ?? f.dia_semana,
        };
      }

      return { ...f, [campo]: val };
    }));
  };

  const handleConfirmar = async () => {
    setError('');

    if (bloqueadoPorEstado) {
      setError(mensajeBloqueoEstado);
      return;
    }

    if (!ventanaInscripcion.canRegister) {
      setError(ventanaInscripcion.message || 'La ventana de inscripcion de este torneo no esta abierta.');
      return;
    }

    if (diasTorneo.length === 0) {
      setError('Este torneo no tiene un rango de fechas valido para la inscripcion.');
      return;
    }

    const disponibilidadInscripcion = [
      ...franjas.map((f) => ({
        ...f,
        es_obligatoria_fin_semana: false,
      })),
      ...franjasObligatorias,
    ];

    if (disponibilidadInscripcion.length === 0) {
      setError('No hay franjas disponibles para enviar.');
      return;
    }

    if (torneoEsDobles && !parejaSeleccionada?.id) {
      setError('En torneos de dobles debes seleccionar una pareja.');
      return;
    }

    // Validar franjas
    for (const f of disponibilidadInscripcion) {
      if (f.hora_inicio >= f.hora_fin) {
        return setError('Asegurate de que la hora de inicio sea menor a la de fin en todas las franjas.');
      }
    }

    const payloadDisponibilidad = disponibilidadInscripcion.map((f) => ({
      fecha: f.fecha,
      dia_semana: parseInt(f.dia_semana, 10),
      hora_inicio: f.hora_inicio,
      hora_fin: f.hora_fin,
      es_obligatoria_fin_semana: Boolean(f.es_obligatoria_fin_semana),
    }));

    setSaving(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/torneos/${torneo.id}/inscribir`, {
        jugador_id: user.id,
        pareja_jugador_id: torneoEsDobles ? parejaSeleccionada?.id : undefined,
        // Mantiene compatibilidad con backend actual mientras se migra a tabla separada.
        disponibilidad: payloadDisponibilidad,
        disponibilidad_inscripcion: payloadDisponibilidad,
      });
      onSuccess?.(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al procesar la inscripción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    // Overlay
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg z-10 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#0b1a2e] to-[#0d2a42] px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-0.5">Inscripción al Torneo</p>
              <h2 className="text-xl font-black">{torneo.titulo}</h2>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors text-white text-sm font-bold">
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !user ? (
            <div className="text-center py-8 text-gray-500">
              <div className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-3 mb-3 text-slate-600">
                <IconLock className="h-8 w-8" />
              </div>
              <p className="font-bold">Debés iniciar sesión para inscribirte.</p>
            </div>
          ) : !perfilCompleto ? (
            // Bloqueo por perfil incompleto
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-center">
              <div className="inline-flex items-center justify-center rounded-2xl border border-amber-300 bg-white p-3 mb-3 text-amber-700">
                <IconAlertTriangle className="h-7 w-7" />
              </div>
              <h3 className="font-black text-amber-800 text-lg mb-1">Perfil Incompleto</h3>
              <p className="text-amber-700 text-sm mb-4">
                Para inscribirte necesitás completar tu perfil con al menos:
              </p>
              <ul className="text-left text-sm text-amber-700 space-y-1 mb-4 inline-block">
                <li className={`flex items-center gap-2 ${categoriaPerfil ? 'text-emerald-600' : ''}`}>
                  {categoriaPerfil ? <IconCheckCircle className="h-4 w-4" /> : <IconXCircle className="h-4 w-4" />} Categoría de juego
                </li>
                <li className={`flex items-center gap-2 ${perfil?.localidad ? 'text-emerald-600' : ''}`}>
                  {perfil?.localidad ? <IconCheckCircle className="h-4 w-4" /> : <IconXCircle className="h-4 w-4" />} Localidad / Ciudad
                </li>
              </ul>
              <a href="/perfil"
                className="mt-2 inline-flex items-center gap-1.5 py-2.5 px-5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl transition-colors text-sm">
                Completar Perfil
                <IconArrowRight className="h-4 w-4" />
              </a>
            </div>
          ) : !cumpleRequisitos ? (
            // Bloqueo por sexo o categoria incompatible
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5 text-center">
              <div className="inline-flex items-center justify-center rounded-2xl border border-rose-300 bg-white p-3 mb-3 text-rose-600">
                <IconXCircle className="h-8 w-8" />
              </div>
              <h3 className="font-black text-rose-800 text-lg mb-2">No cumplés los requisitos</h3>
              <p className="text-rose-700 text-sm mb-4">{mensajeRequisito}</p>
              <div className="rounded-xl bg-white border border-rose-200 px-4 py-3 text-sm text-left space-y-1 mb-4">
                <p className="font-semibold text-slate-600 mb-2">Requisitos del torneo:</p>
                {ramaT && ramaT !== 'Mixto' && (
                  <p className="flex items-center gap-2 text-slate-700">
                    {sexoOk ? <IconCheckCircle className="h-4 w-4 text-emerald-500" /> : <IconXCircle className="h-4 w-4 text-rose-500" />}
                    Rama: <span className="font-bold">{ramaT}</span>
                    {!sexoOk && <span className="text-rose-500 ml-1">(tu perfil: {sexoPerfil || 'no definido'})</span>}
                  </p>
                )}
                {categoriaT != null && (
                  <p className="flex items-center gap-2 text-slate-700">
                    {catOk ? <IconCheckCircle className="h-4 w-4 text-emerald-500" /> : <IconXCircle className="h-4 w-4 text-rose-500" />}
                    Categoría: <span className="font-bold">Cat {categoriaT}</span>
                    {!catOk && <span className="text-rose-500 ml-1">(tu perfil: Cat {catPerfilNum ?? '?'})</span>}
                  </p>
                )}
              </div>
              <button onClick={onClose}
                className="inline-flex items-center gap-1.5 py-2.5 px-5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors text-sm">
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {/* Perfil OK - badge */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <span className="text-emerald-600"><IconCheckCircle className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-bold text-emerald-800">{perfil.nombre_completo}</p>
                  <p className="text-xs text-emerald-600">Cat. {categoriaPerfil} · {perfil.localidad}</p>
                </div>
              </div>

              {torneoEsDobles && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <p className="text-sm font-bold text-slate-700">Selecciona tu pareja para dobles</p>
                  <input
                    type="text"
                    value={parejaQuery}
                    onChange={(e) => setParejaQuery(e.target.value)}
                    placeholder="Buscar por nombre (min. 2 letras)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  />

                  {parejaLoading && (
                    <p className="text-xs text-slate-500">Buscando jugadores compatibles...</p>
                  )}

                  {!parejaLoading && parejaQuery.trim().length >= 2 && parejaOpciones.length === 0 && (
                    <p className="text-xs text-slate-500">No encontramos jugadores disponibles con ese criterio.</p>
                  )}

                  {parejaOpciones.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {parejaOpciones.map((opcion) => {
                        const active = parejaSeleccionada?.id === opcion.id;
                        return (
                          <button
                            type="button"
                            key={opcion.id}
                            onClick={() => setParejaSeleccionada(opcion)}
                            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${active ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'}`}
                          >
                            <p className="font-semibold">{opcion.nombre_completo || opcion.id}</p>
                            <p className="text-xs opacity-70">Sexo: {opcion.sexo || '-'} · Cat dobles: {opcion.categoria_dobles ?? opcion.categoria ?? '-'}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {parejaSeleccionada && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs uppercase tracking-wide text-emerald-700 font-bold">Pareja seleccionada</p>
                      <p className="text-sm font-semibold text-emerald-900">{parejaSeleccionada.nombre_completo}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Selector de franjas */}
              <div>
                <p className="text-sm font-bold text-gray-700 mb-3 inline-flex items-center gap-1.5">
                  <IconCalendar className="h-4 w-4 text-slate-600" />
                  Seleccioná tu disponibilidad horaria
                </p>

                {!ventanaInscripcion.canRegister && ventanaInscripcion.message && (
                  <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <p className="font-semibold">Inscripcion no habilitada</p>
                    <p>{ventanaInscripcion.message}</p>
                  </div>
                )}

                {bloqueadoPorEstado && (
                  <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <p className="font-semibold">Inscripcion no habilitada</p>
                    <p>{mensajeBloqueoEstado}</p>
                  </div>
                )}

                <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700 space-y-1">
                  <p className="font-semibold">Dias habilitados para este torneo</p>
                  <p>{diasTorneo.map((d) => d.label).join(' · ') || 'Sin dias disponibles'}</p>
                </div>

                {franjasObligatorias.length > 0 && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-800 mb-2">Disponibilidad obligatoria (Full Time)</p>
                    <div className="space-y-2">
                      {franjasObligatorias.map((f) => {
                        const dia = obtenerDiaPorFecha(f.fecha);
                        return (
                          <div key={`obligatoria-${f.fecha}`} className="flex items-center justify-between rounded-lg bg-white border border-amber-100 px-3 py-2">
                            <span className="text-sm font-semibold text-amber-900">{dia?.label || f.fecha}</span>
                            <span className="text-xs font-bold text-amber-700">{f.hora_inicio} - {f.hora_fin}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {franjas.map((f, i) => (
                    <div key={i} className="flex gap-2 items-end bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Día</label>
                        <select value={f.fecha} onChange={e => cambiar(i, 'fecha', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50">
                          {diasTorneo.map((d) => (
                            <option key={d.fecha} value={d.fecha} disabled={d.es_fin_de_semana}>
                              {d.label}{d.es_fin_de_semana ? ' (Obligatorio Full Time)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
                        <input type="time" value={f.hora_inicio} onChange={e => cambiar(i, 'hora_inicio', e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
                        <input type="time" value={f.hora_fin} onChange={e => cambiar(i, 'hora_fin', e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50" />
                      </div>
                      {franjas.length > 1 && (
                        <button type="button" onClick={() => quitarFranja(i)}
                          className="text-red-400 hover:text-red-500 px-1 pb-1 transition-colors">
                          <IconClose className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {diasEditables.length > 0 ? (
                  <button type="button" onClick={agregarFranja}
                    className="mt-3 text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors">
                    <span className="text-lg">+</span> Agregar franja
                  </button>
                ) : (
                  <p className="mt-3 text-xs font-medium text-gray-500">
                    Este torneo solo tiene dias de fin de semana, ya cargados como disponibilidad obligatoria.
                  </p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl inline-flex items-start gap-2">
                  <IconAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {perfilCompleto && user && (
          <div className="px-6 pb-6 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 border border-gray-200 text-gray-600 font-bold rounded-2xl hover:bg-gray-50 transition-colors text-sm">
              Cancelar
            </button>
            <button onClick={handleConfirmar} disabled={saving || franjasTotales.length === 0 || !ventanaInscripcion.canRegister || bloqueadoPorEstado || (torneoEsDobles && !parejaSeleccionada?.id)}
              className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black rounded-2xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-60 text-sm">
              {saving ? 'Inscribiendo...' : (!ventanaInscripcion.canRegister || bloqueadoPorEstado) ? 'Inscripcion no habilitada' : (
                <span className="inline-flex items-center gap-1.5">
                  <IconSpark className="h-4 w-4" />
                  Confirmar Inscripción
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
