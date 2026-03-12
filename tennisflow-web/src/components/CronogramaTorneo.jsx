/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';

const DAY_OPTIONS = [
  { key: 'viernes', label: 'Viernes', weekday: 5 },
  { key: 'sabado', label: 'Sabado', weekday: 6 },
  { key: 'domingo', label: 'Domingo', weekday: 0 },
];

const BASE_SLOTS = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30'];

const DAY_BY_WEEKDAY = DAY_OPTIONS.reduce((acc, day) => {
  acc[day.weekday] = day.key;
  return acc;
}, {});

const normalizeText = (value) => String(value || '').toLowerCase();
const normalizeCanchaName = (value) => normalizeText(value).replace(/\s+/g, ' ').trim();
const hasValue = (value) => value !== null && value !== undefined && value !== '';
const getFirstNonEmpty = (values = []) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const safe = String(value).trim();
    if (safe) return safe;
  }
  return '';
};

const toMinutes = (timeValue) => {
  const [hours, minutes] = String(timeValue || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

const hasMeaningfulLiveEvidence = (partido) => {
  const rawScore = String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '').trim().toUpperCase();
  const defaultScores = new Set(['', '0-0', '-/-', 'S0-0 G0-0 P0-0', 'S0-0 G0-0 TB0-0']);

  if (String(partido?.inicio_real || '').trim()) return true;
  if (String(partido?.ultima_actualizacion || '').trim()) return true;
  if (!defaultScores.has(rawScore)) return true;

  return false;
};

const getPartidoEstado = (partido) => {
  const estado = normalizeText(partido?.estado);

  if (estado.includes('final') || estado.includes('complet') || estado.includes('termin')) {
    return { key: 'finalizado', label: 'Finalizado', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }

  if ((estado.includes('juego') || estado.includes('curso') || estado.includes('playing') || estado.includes('live')) && hasMeaningfulLiveEvidence(partido)) {
    return { key: 'en_juego', label: 'En Juego', badge: 'bg-amber-100 text-amber-700 border-amber-200' };
  }

  if (partido?.ganador_id) {
    return { key: 'finalizado', label: 'Finalizado', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }

  return { key: 'programado', label: 'Programado', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
};

const getDayKeyFromDate = (dateValue) => {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return DAY_BY_WEEKDAY[parsed.getDay()] || null;
};

const getCanchaId = (partido) => partido?.cancha_id || partido?.cancha?.id || null;
const getCanchaNameFromPartido = (partido) => partido?.cancha?.nombre || partido?.cancha_nombre || partido?.cancha || '';

const getCanchaKeyFromId = (id) => (id === null || id === undefined || id === '' ? '' : `id:${String(id)}`);
const getCanchaKeyFromName = (name) => {
  const normalized = normalizeCanchaName(name);
  return normalized ? `name:${normalized}` : '';
};

const getCanchaRefFromPartido = (partido) => {
  const canchaId = getCanchaId(partido);
  if (canchaId !== null && canchaId !== undefined && canchaId !== '') {
    return {
      key: getCanchaKeyFromId(canchaId),
      id: canchaId,
      nombre: getCanchaNameFromPartido(partido),
    };
  }

  const canchaName = getCanchaNameFromPartido(partido);
  const canchaKey = getCanchaKeyFromName(canchaName);
  if (!canchaKey) return null;

  return {
    key: canchaKey,
    id: null,
    nombre: canchaName,
  };
};

const getCanchaLabel = (cancha) => cancha?.nombre || cancha?.label || `Cancha ${cancha?.id || '-'}`;

const getPartidoId = (partido) => getFirstNonEmpty([
  partido?.id,
  partido?.partido_id,
  partido?.partidoId,
  partido?.match_id,
  partido?.matchId,
]);

const getNombreCompletoJugador = (jugador) => {
  const nombre = String(
    jugador?.nombre
    ?? jugador?.nombres
    ?? jugador?.first_name
    ?? jugador?.firstname
    ?? ''
  ).trim();
  const apellido = String(
    jugador?.apellido
    ?? jugador?.apellidos
    ?? jugador?.last_name
    ?? jugador?.lastname
    ?? jugador?.surname
    ?? ''
  ).trim();
  const nombreCompleto = String(
    jugador?.nombre_completo
    ?? jugador?.full_name
    ?? ''
  ).trim();

  if (nombre && apellido) return `${nombre} ${apellido}`;
  if (nombreCompleto && apellido && !nombreCompleto.toLowerCase().includes(apellido.toLowerCase())) {
    return `${nombreCompleto} ${apellido}`.trim();
  }

  return nombreCompleto || [nombre, apellido].filter(Boolean).join(' ').trim() || '';
};

const getJugadorId = (partido, side) => {
  const player = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const idFields = side === 1
    ? ['jugador1_id', 'player1_id', 'participante1_id', 'competidor1_id', 'jugador_1_id', 'id_jugador_1']
    : ['jugador2_id', 'player2_id', 'participante2_id', 'competidor2_id', 'jugador_2_id', 'id_jugador_2'];

  return getFirstNonEmpty([
    player?.id,
    ...idFields.map((field) => partido?.[field]),
  ]);
};

const getOrigenPartidoId = (partido, side) => {
  const originFields = side === 1
    ? ['jugador1_origen_partido_id', 'partido_anterior_1_id', 'origen_partido_1_id', 'previous_match_1_id']
    : ['jugador2_origen_partido_id', 'partido_anterior_2_id', 'origen_partido_2_id', 'previous_match_2_id'];

  return getFirstNonEmpty(originFields.map((field) => partido?.[field]));
};

const getJugadorLabel = (partido, side) => {
  const player = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const partner = side === 1 ? partido?.jugador1_pareja : partido?.jugador2_pareja;

  const nameFields = side === 1
    ? ['jugador1_nombre', 'nombre_jugador_1', 'player1_name', 'jugador1_pareja_nombre', 'nombre_pareja_jugador_1']
    : ['jugador2_nombre', 'nombre_jugador_2', 'player2_name', 'jugador2_pareja_nombre', 'nombre_pareja_jugador_2'];

  for (const field of nameFields) {
    if (partido?.[field]) return partido[field];
  }

  const titularName = getNombreCompletoJugador(player);
  const parejaName = getNombreCompletoJugador(partner);

  if (titularName && parejaName) {
    return `${titularName} / ${parejaName}`;
  }

  if (titularName) return titularName;
  if (parejaName) return parejaName;

  return '';
};

const getCategoriaRama = (partido) => {
  const categoria = partido?.categoria || partido?.torneo_categoria || partido?.categoria_nombre || '-';
  const rama = partido?.rama || partido?.sexo || partido?.branch || '-';
  return `${categoria} / ${rama}`;
};

const getPartidoMarcador = (partido) => {
  return String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '').trim();
};

const slotKey = ({ canchaKey, time, day }) => `${String(canchaKey)}__${time}__${day}`;

const getNextDateByWeekday = (weekday) => {
  const date = new Date();
  date.setSeconds(0, 0);

  const today = date.getDay();
  const delta = (weekday - today + 7) % 7;
  date.setDate(date.getDate() + delta);
  return date;
};

const composeSlotDateTime = ({ dayKey, time, referenceByDay }) => {
  const dayConfig = DAY_OPTIONS.find((item) => item.key === dayKey);
  const baseDate = referenceByDay[dayKey]
    ? new Date(referenceByDay[dayKey])
    : getNextDateByWeekday(dayConfig?.weekday ?? 5);

  const [hours, minutes] = time.split(':').map(Number);
  baseDate.setHours(hours || 0, minutes || 0, 0, 0);
  return baseDate.toISOString();
};

const buildCanchaCatalog = ({ canchas, partidos }) => {
  const canchaMap = new Map();
  const canchaKeyById = new Map();
  const canchaKeyByName = new Map();

  const registerCancha = ({ id, nombre, keyHint }) => {
    const normalizedName = normalizeCanchaName(nombre);
    const idKey = hasValue(id) ? getCanchaKeyFromId(id) : '';

    const existingKey = (hasValue(id) && canchaKeyById.get(String(id)))
      || (normalizedName && canchaKeyByName.get(normalizedName));

    if (existingKey && canchaMap.has(existingKey)) {
      const existing = canchaMap.get(existingKey);

      if (!hasValue(existing.id) && hasValue(id)) {
        existing.id = id;
        canchaKeyById.set(String(id), existingKey);
      }

      if ((!existing.nombre || existing.nombre === 'Sin cancha') && nombre) {
        existing.nombre = nombre;
      }

      if (normalizedName) {
        canchaKeyByName.set(normalizedName, existingKey);
      }

      return existingKey;
    }

    const finalKey = keyHint || idKey || getCanchaKeyFromName(nombre) || `generated:${canchaMap.size + 1}`;
    canchaMap.set(finalKey, {
      key: finalKey,
      id: hasValue(id) ? id : null,
      nombre: nombre || 'Sin cancha',
    });

    if (hasValue(id)) {
      canchaKeyById.set(String(id), finalKey);
    }

    if (normalizedName) {
      canchaKeyByName.set(normalizedName, finalKey);
    }

    return finalKey;
  };

  canchas.forEach((cancha) => {
    registerCancha({
      id: cancha?.id,
      nombre: getCanchaLabel(cancha),
      keyHint: hasValue(cancha?.id) ? getCanchaKeyFromId(cancha.id) : getCanchaKeyFromName(getCanchaLabel(cancha)),
    });
  });

  partidos.forEach((partido) => {
    const canchaRef = getCanchaRefFromPartido(partido);
    if (!canchaRef) return;

    registerCancha({
      id: canchaRef.id,
      nombre: canchaRef.nombre || getCanchaLabel(partido?.cancha),
      keyHint: canchaRef.key,
    });
  });

  const list = Array.from(canchaMap.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

  if (list.length === 0) {
    return {
      list: [{ key: 'sin-cancha', id: null, nombre: 'Sin cancha' }],
      canchaKeyById,
      canchaKeyByName,
    };
  }

  return {
    list,
    canchaKeyById,
    canchaKeyByName,
  };
};

export default function CronogramaTorneo({
  partidos = [],
  canchas = [],
  adminMode = false,
  onRefresh,
  onProgramarPartido,
  onReprogramarPartido,
  onIniciarPartido,
  onActualizarMarcadorRapido,
  onFinalizarPartidoRapido,
  onAbrirResultado,
  onPublicarCronograma,
  publishing = false,
  actionBusy = false,
}) {
  const [selectedDay, setSelectedDay] = useState('viernes');
  const [slotModal, setSlotModal] = useState({ open: false, canchaId: null, canchaKey: '', time: '' });
  const [selectedPartidoId, setSelectedPartidoId] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [draggedPartidoId, setDraggedPartidoId] = useState(null);
  const [dragSourceSlot, setDragSourceSlot] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState('');
  const [liveScoreByPartido, setLiveScoreByPartido] = useState({});

  const referenceDateByDay = useMemo(() => {
    const referenceMap = {};

    partidos.forEach((partido) => {
      if (!partido?.fecha_hora) return;
      const dayKey = getDayKeyFromDate(partido.fecha_hora);
      if (!dayKey) return;

      const parsed = new Date(partido.fecha_hora);
      if (Number.isNaN(parsed.getTime())) return;

      if (!referenceMap[dayKey] || parsed < referenceMap[dayKey]) {
        referenceMap[dayKey] = parsed;
      }
    });

    return referenceMap;
  }, [partidos]);

  const canchaCatalog = useMemo(() => buildCanchaCatalog({ canchas, partidos }), [canchas, partidos]);
  const canchasGrid = canchaCatalog.list;

  const jugadoresResueltosPorPartido = useMemo(() => {
    const byRound = {};

    partidos.forEach((partido) => {
      const roundOrder = Number(partido?.ronda_orden || 0);
      if (!Number.isFinite(roundOrder) || roundOrder <= 0) return;
      if (!byRound[roundOrder]) byRound[roundOrder] = [];
      byRound[roundOrder].push(partido);
    });

    const roundOrders = Object.keys(byRound)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a);

    const resolved = {};
    const winnerNameByMatchId = {};

    const sortRoundMatches = (matches = []) => {
      return [...matches].sort((a, b) => {
        const byOrder = Number(a?.orden_en_ronda || 0) - Number(b?.orden_en_ronda || 0);
        if (byOrder !== 0) return byOrder;
        return String(getPartidoId(a) || '').localeCompare(String(getPartidoId(b) || ''));
      });
    };

    const resolveSideName = (partido, side) => {
      const originMatchId = getOrigenPartidoId(partido, side);
      if (originMatchId) {
        const winnerName = winnerNameByMatchId[String(originMatchId)] || '';
        return winnerName || 'Por definir';
      }

      return getJugadorLabel(partido, side) || 'Por definir';
    };

    roundOrders.forEach((roundOrder) => {
      const roundMatches = sortRoundMatches(byRound[roundOrder] || []);

      roundMatches.forEach((partido) => {
        const partidoId = getPartidoId(partido);
        if (!partidoId) return;

        const j1Name = resolveSideName(partido, 1);
        const j2Name = resolveSideName(partido, 2);
        const j1Id = getJugadorId(partido, 1);
        const j2Id = getJugadorId(partido, 2);

        resolved[partidoId] = { j1Name, j2Name };

        const winnerId = String(partido?.ganador_id || '').trim();
        if (!winnerId) return;

        const winnerName = winnerId === String(j1Id || '').trim()
          ? j1Name
          : winnerId === String(j2Id || '').trim()
            ? j2Name
            : '';

        if (winnerName) winnerNameByMatchId[partidoId] = winnerName;
      });
    });

    return resolved;
  }, [partidos]);

  const getJugadorLabelResuelto = (partido, side) => {
    const partidoId = getPartidoId(partido);
    const resolved = partidoId ? jugadoresResueltosPorPartido[partidoId] : null;

    if (resolved) {
      if (side === 1 && resolved.j1Name) return resolved.j1Name;
      if (side === 2 && resolved.j2Name) return resolved.j2Name;
    }

    return getJugadorLabel(partido, side) || 'Por definir';
  };

  const partidosDelDia = useMemo(
    () => partidos.filter((partido) => getDayKeyFromDate(partido?.fecha_hora) === selectedDay),
    [partidos, selectedDay]
  );

  const slots = useMemo(() => {
    const dynamicSlots = new Set(BASE_SLOTS);

    partidosDelDia.forEach((partido) => {
      const parsed = new Date(partido.fecha_hora);
      if (Number.isNaN(parsed.getTime())) return;
      dynamicSlots.add(format(parsed, 'HH:mm'));
    });

    return Array.from(dynamicSlots).sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [partidosDelDia]);

  const partidosBySlot = useMemo(() => {
    const map = new Map();

    partidosDelDia.forEach((partido) => {
      const canchaRef = getCanchaRefFromPartido(partido);
      if (!canchaRef?.key || !partido?.fecha_hora) return;

      const parsed = new Date(partido.fecha_hora);
      if (Number.isNaN(parsed.getTime())) return;

      const time = format(parsed, 'HH:mm');
      const canonicalKey = (hasValue(canchaRef.id) && canchaCatalog.canchaKeyById.get(String(canchaRef.id)))
        || canchaCatalog.canchaKeyByName.get(normalizeCanchaName(canchaRef.nombre))
        || canchaRef.key;

      if (!canonicalKey) return;
      map.set(slotKey({ canchaKey: canonicalKey, time, day: selectedDay }), partido);
    });

    return map;
  }, [partidosDelDia, selectedDay, canchaCatalog]);

  const partidosAsignables = useMemo(() => {
    return partidos
      .filter((partido) => {
        const estado = getPartidoEstado(partido);
        return estado.key !== 'finalizado';
      })
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [partidos]);

  const openManualModal = ({ canchaId, canchaKey, time }) => {
    if (!adminMode) return;
    setSelectedPartidoId('');
    setSlotModal({ open: true, canchaId, canchaKey, time });
  };

  const closeManualModal = () => {
    setSlotModal({ open: false, canchaId: null, canchaKey: '', time: '' });
    setSelectedPartidoId('');
  };

  const handleManualAssign = async (event) => {
    event.preventDefault();
    if (!selectedPartidoId || !slotModal.canchaId || !slotModal.time || !onProgramarPartido) return;

    setSavingManual(true);

    const payload = {
      canchaId: slotModal.canchaId,
      hora: slotModal.time,
      dia: selectedDay,
      fechaHora: composeSlotDateTime({
        dayKey: selectedDay,
        time: slotModal.time,
        referenceByDay: referenceDateByDay,
      }),
    };

    const ok = await onProgramarPartido(selectedPartidoId, payload);
    setSavingManual(false);

    if (ok) {
      closeManualModal();
    }
  };

  const buildSlotPayload = ({ canchaId, time }) => {
    return {
      canchaId,
      hora: time,
      dia: selectedDay,
      fechaHora: composeSlotDateTime({
        dayKey: selectedDay,
        time,
        referenceByDay: referenceDateByDay,
      }),
    };
  };

  const clearDragState = () => {
    setDraggedPartidoId(null);
    setDragSourceSlot(null);
    setDragOverSlot('');
  };

  const handleDragStart = (event, partidoId, sourceSlot) => {
    if (!adminMode || !partidoId) return;

    const dragId = String(partidoId);
    setDraggedPartidoId(dragId);
    setDragSourceSlot(sourceSlot || null);

    if (event?.dataTransfer) {
      event.dataTransfer.setData('text/plain', dragId);
      event.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDrop = async ({ canchaId, time, slotId, dragEvent, targetPartido }) => {
    const dropId = dragEvent?.dataTransfer?.getData('text/plain') || draggedPartidoId;
    if (!adminMode || !dropId || !onReprogramarPartido || !canchaId) return;

    if (targetPartido && String(targetPartido.id) === String(dropId)) {
      clearDragState();
      return;
    }

    const destinationPayload = buildSlotPayload({ canchaId, time });

    // Si el slot destino ya tiene partido, hacemos swap con el slot origen del drag.
    if (targetPartido?.id && dragSourceSlot?.canchaId && dragSourceSlot?.time) {
      const originPayload = buildSlotPayload({ canchaId: dragSourceSlot.canchaId, time: dragSourceSlot.time });

      const movedDragged = await onReprogramarPartido(dropId, destinationPayload);
      if (!movedDragged) {
        clearDragState();
        return;
      }

      await onReprogramarPartido(targetPartido.id, originPayload);
      clearDragState();
      return;
    }

    await onReprogramarPartido(dropId, destinationPayload);
    clearDragState();
  };

  const dayLabel = DAY_OPTIONS.find((day) => day.key === selectedDay)?.label || 'Dia';

  const getLiveScoreValue = (partido) => {
    const partidoId = String(partido?.id || '');
    if (!partidoId) return '';
    if (Object.prototype.hasOwnProperty.call(liveScoreByPartido, partidoId)) {
      return liveScoreByPartido[partidoId];
    }
    return getPartidoMarcador(partido);
  };

  const setLiveScoreValue = (partidoId, value) => {
    const key = String(partidoId || '');
    if (!key) return;
    setLiveScoreByPartido((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleIniciarPartidoClick = async (partido) => {
    if (!onIniciarPartido) return;
    await onIniciarPartido(partido);
  };

  const handleActualizarMarcadorClick = async (partido) => {
    if (!onActualizarMarcadorRapido || !partido?.id) return;
    const marcador = getLiveScoreValue(partido);
    const ok = await onActualizarMarcadorRapido(partido.id, marcador);
    if (ok) {
      setLiveScoreValue(partido.id, marcador.trim());
    }
  };

  const handleFinalizarPartidoClick = async (partido) => {
    if (!onFinalizarPartidoRapido || !partido?.id) return;
    const marcador = getLiveScoreValue(partido);
    await onFinalizarPartidoRapido(partido.id, marcador);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mt-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Cronograma por Cancha</h3>
          <p className="text-sm text-gray-500">{dayLabel}: arrastra un partido para reprogramar o toca un slot vacio para asignarlo manualmente.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedDay}
            onChange={(event) => setSelectedDay(event.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold"
          >
            {DAY_OPTIONS.map((day) => (
              <option key={day.key} value={day.key}>
                {day.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Refrescar
          </button>

          {adminMode && (
            <button
              type="button"
              onClick={onPublicarCronograma}
              disabled={publishing}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {publishing ? 'Publicando...' : 'Publicar Cronograma'}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-gray-100 border border-gray-200 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-gray-500">Hora</th>
              {canchasGrid.map((cancha) => (
                <th key={cancha.key} className="bg-gray-100 border border-gray-200 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-gray-600 min-w-[220px]">
                  {cancha.nombre}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {slots.map((time) => (
              <tr key={`${selectedDay}-${time}`}>
                <td className="sticky left-0 z-10 bg-white border border-gray-200 px-3 py-3 text-sm font-bold text-gray-700">{time}</td>

                {canchasGrid.map((cancha) => {
                  const key = slotKey({ canchaKey: cancha.key, time, day: selectedDay });
                  const partido = partidosBySlot.get(key);
                  const isSameDraggedMatch = partido && draggedPartidoId && String(partido.id) === String(draggedPartidoId);
                  const canReceiveDrop = Boolean(adminMode && draggedPartidoId && !actionBusy && cancha.id && !isSameDraggedMatch);
                  const isDropTarget = dragOverSlot === key && canReceiveDrop;

                  return (
                    <td
                      key={key}
                      className={`align-top border p-2 bg-white transition-colors ${isDropTarget ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}
                      onDragOver={(event) => {
                        if (!canReceiveDrop) return;
                        event.preventDefault();
                        setDragOverSlot(key);
                      }}
                      onDragLeave={() => {
                        if (dragOverSlot === key) setDragOverSlot('');
                      }}
                      onDrop={async (event) => {
                        event.preventDefault();
                        if (!canReceiveDrop) return;
                        await handleDrop({ canchaId: cancha.id, time, slotId: key, dragEvent: event, targetPartido: partido });
                      }}
                    >
                      {partido ? (
                        <div
                          draggable={adminMode}
                          onDragStart={(event) => handleDragStart(event, partido.id, { canchaId: cancha.id, time, slotId: key })}
                          onDragEnd={clearDragState}
                          className="w-full cursor-grab active:cursor-grabbing text-left rounded-lg border border-blue-100 bg-blue-50 p-3 hover:border-blue-300 hover:bg-blue-100 transition-colors"
                        >
                          {(() => {
                            const estadoPartido = getPartidoEstado(partido);
                            const isProgramado = estadoPartido.key === 'programado';
                            const isEnJuego = estadoPartido.key === 'en_juego';

                            return (
                              <>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${estadoPartido.badge}`}>
                                    {estadoPartido.label}
                                  </span>
                                  <span className="text-[10px] font-bold text-gray-500">P{partido.id}</span>
                                </div>

                                <p className="text-sm font-bold text-gray-800 leading-tight break-words">{getJugadorLabelResuelto(partido, 1)}</p>
                                <p className="text-xs font-semibold text-gray-500 mb-1 leading-tight break-words">vs {getJugadorLabelResuelto(partido, 2)}</p>
                                <p className="text-[11px] text-gray-500">{getCategoriaRama(partido)}</p>

                                {adminMode && (
                                  <div className="mt-3 space-y-2" onClick={(event) => event.stopPropagation()}>
                                    {isProgramado && (
                                      <button
                                        type="button"
                                        onClick={() => handleIniciarPartidoClick(partido)}
                                        disabled={actionBusy}
                                        className="w-full rounded-md bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                                      >
                                        Iniciar Partido
                                      </button>
                                    )}

                                    {isEnJuego && (
                                      <div className="space-y-2">
                                        <input
                                          type="text"
                                          value={getLiveScoreValue(partido)}
                                          onChange={(event) => setLiveScoreValue(partido.id, event.target.value)}
                                          placeholder="Ej: 4-2"
                                          className="w-full rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800"
                                        />

                                        <div className="grid grid-cols-2 gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleActualizarMarcadorClick(partido)}
                                            disabled={actionBusy}
                                            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                                          >
                                            Actualizar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleFinalizarPartidoClick(partido)}
                                            disabled={actionBusy}
                                            className="rounded-md bg-gray-900 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-gray-800 disabled:opacity-60"
                                          >
                                            Finalizar
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => onAbrirResultado?.(partido)}
                                      disabled={actionBusy}
                                      className="w-full rounded-md border border-blue-200 bg-blue-100 px-2 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-200 disabled:opacity-60"
                                    >
                                      Cargar resultado
                                    </button>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openManualModal({ canchaId: cancha.id, canchaKey: cancha.key, time })}
                          onDragOver={(event) => {
                            if (!canReceiveDrop) return;
                            event.preventDefault();
                            setDragOverSlot(key);
                          }}
                          onDrop={async (event) => {
                            if (!canReceiveDrop) return;
                            event.preventDefault();
                            await handleDrop({ canchaId: cancha.id, time, slotId: key, dragEvent: event, targetPartido: null });
                          }}
                          disabled={!adminMode || actionBusy || !cancha.id}
                          className="w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-5 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed"
                        >
                          + Slot vacio
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {slotModal.open && adminMode && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleManualAssign} className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-black text-gray-900">Asignar Partido Manualmente</h4>
                <p className="text-sm text-gray-500">
                  {dayLabel} - {slotModal.time} - {getCanchaLabel(canchasGrid.find((c) => c.key === slotModal.canchaKey))}
                </p>
              </div>
              <button type="button" onClick={closeManualModal} className="text-sm font-bold text-gray-500 hover:text-gray-700">Cerrar</button>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Partido</label>
              <select
                required
                value={selectedPartidoId}
                onChange={(event) => setSelectedPartidoId(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300"
              >
                <option value="">Seleccionar partido...</option>
                {partidosAsignables.map((partido) => {
                  const descripcion = `${getJugadorLabelResuelto(partido, 1)} vs ${getJugadorLabelResuelto(partido, 2)}`;
                  return (
                    <option key={partido.id} value={partido.id}>
                      P{partido.id} - {descripcion}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Esta accion fuerza horario y cancha para el partido seleccionado.
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeManualModal} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingManual}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 disabled:opacity-60"
              >
                {savingManual ? 'Asignando...' : 'Asignar partido'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
