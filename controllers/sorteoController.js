const supabase = require('../services/supabase');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_HORA_INICIO_DIA = '09:00';
const DEFAULT_HORA_FIN_DIA = '22:00';
const DEFAULT_DURACION_TURNO = 90;
const MIN_REST_MINUTES = 60;
const VALID_TOURNAMENT_STATES = new Set([
  'borrador',
  'publicado',
  'abierto',
  'en_progreso',
  'finalizado',
  'cancelado',
]);

/**
 * Convierte un string de tiempo "HH:MM" o "HH:MM:SS" a minutos totales desde las 00:00
 */
function timeToMinutes(timeStr) {
  if (typeof timeStr !== 'string') {
    return null;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(timeStr.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

/**
 * Convierte minutos a un string "HH:MM"
 */
function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function parseIsoToUtcDateOnly(value) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function toDateKey(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function appendNote(current, text) {
  if (!text) return current || null;
  if (!current) return text;
  if (current.includes(text)) return current;
  return `${current}; ${text}`;
}

function normalizeTournamentStateInput(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  const aliasMap = {
    inscripcion: 'publicado',
    activo: 'en_progreso',
    active: 'en_progreso',
    en_curso: 'en_progreso',
    'en curso': 'en_progreso',
    in_progress: 'en_progreso',
    started: 'en_progreso',
    programado: 'en_progreso',
    scheduled: 'en_progreso',
    terminado: 'finalizado',
    finished: 'finalizado',
    cancelled: 'cancelado',
  };

  const mapped = aliasMap[normalized] || normalized;
  return VALID_TOURNAMENT_STATES.has(mapped) ? mapped : null;
}

function parseSchedulerConfig(body = {}) {
  const horaInicioRaw = body.hora_inicio_dia || DEFAULT_HORA_INICIO_DIA;
  const horaFinRaw = body.hora_fin_dia || DEFAULT_HORA_FIN_DIA;
  const duracionRaw = body.duracion_turno == null ? DEFAULT_DURACION_TURNO : Number(body.duracion_turno);

  const horaInicioMin = timeToMinutes(String(horaInicioRaw));
  const horaFinMin = timeToMinutes(String(horaFinRaw));

  if (horaInicioMin === null || horaFinMin === null) {
    return { error: 'hora_inicio_dia y hora_fin_dia deben tener formato HH:MM.' };
  }

  if (!Number.isInteger(duracionRaw) || duracionRaw <= 0) {
    return { error: 'duracion_turno debe ser un entero positivo en minutos.' };
  }

  if (horaFinMin <= horaInicioMin) {
    return { error: 'hora_fin_dia debe ser mayor a hora_inicio_dia.' };
  }

  if (duracionRaw > (horaFinMin - horaInicioMin)) {
    return { error: 'duracion_turno es mayor a la ventana horaria del dia.' };
  }

  return {
    horaInicioMin,
    horaFinMin,
    duracionTurno: duracionRaw,
    horaInicioDia: minutesToTime(horaInicioMin),
    horaFinDia: minutesToTime(horaFinMin),
  };
}

function listTournamentDays(startDateUtc, endDateUtc) {
  const days = [];
  const current = new Date(startDateUtc.getTime());
  const safeEnd = endDateUtc || startDateUtc;

  while (current.getTime() <= safeEnd.getTime()) {
    days.push(new Date(current.getTime()));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

function getRoundName(rondaOrden) {
  if (rondaOrden === 2) return 'Final';
  if (rondaOrden === 4) return 'Semifinal';
  if (rondaOrden === 8) return 'Cuartos de Final';
  if (rondaOrden === 16) return 'Octavos de Final';
  if (rondaOrden === 32) return 'Primera Ronda';
  return `Ronda de ${rondaOrden}`;
}

function buildSlots({ days, canchaIds, horaInicioMin, horaFinMin, duracionTurno }) {
  const slots = [];
  let slotId = 0;

  for (const day of days) {
    for (let startMin = horaInicioMin; startMin + duracionTurno <= horaFinMin; startMin += duracionTurno) {
      const hour = Math.floor(startMin / 60);
      const minute = startMin % 60;
      const slotDate = new Date(Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        hour,
        minute,
        0,
        0,
      ));

      for (const canchaId of canchaIds) {
        slots.push({
          id: `slot-${slotId++}`,
          cancha_id: canchaId,
          startDate: slotDate,
          endDate: new Date(slotDate.getTime() + duracionTurno * 60000),
          dateKey: toDateKey(slotDate),
          dayOfWeek: slotDate.getUTCDay(),
          startMin,
          endMin: startMin + duracionTurno,
        });
      }
    }
  }

  return slots.sort((a, b) => {
    const dateDiff = a.startDate.getTime() - b.startDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.cancha_id.localeCompare(b.cancha_id);
  });
}

function normalizeAvailabilityRows(rows) {
  const map = new Map();

  for (const row of rows || []) {
    if (!row || !row.jugador_id) continue;

    const startMin = timeToMinutes(row.hora_inicio);
    const endMin = timeToMinutes(row.hora_fin);
    if (startMin === null || endMin === null || startMin >= endMin) continue;

    const rec = { startMin, endMin };

    if (row.fecha) {
      const parsedDate = parseIsoToUtcDateOnly(row.fecha);
      if (parsedDate) {
        rec.dateKey = toDateKey(parsedDate);
      }
    }

    const dayOfWeek = Number(row.dia_semana);
    if (Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
      rec.dayOfWeek = dayOfWeek;
    }

    if (!map.has(row.jugador_id)) {
      map.set(row.jugador_id, []);
    }

    map.get(row.jugador_id).push(rec);
  }

  return map;
}

function isPlayerAvailableAt(records, slot) {
  if (!records || records.length === 0) return false;

  return records.some((rec) => {
    if (rec.dateKey && rec.dateKey !== slot.dateKey) {
      return false;
    }

    if (rec.dayOfWeek !== undefined && rec.dayOfWeek !== slot.dayOfWeek) {
      return false;
    }

    return slot.startMin >= rec.startMin && slot.endMin <= rec.endMin;
  });
}

function hasRestConflict(intervals, slot, minRestMinutes) {
  if (!intervals || intervals.length === 0) return false;

  for (const interval of intervals) {
    const overlap = !(slot.endMin <= interval.startMin || slot.startMin >= interval.endMin);
    if (overlap) return true;

    const gap = slot.startMin >= interval.endMin
      ? slot.startMin - interval.endMin
      : interval.startMin - slot.endMin;

    if (gap < minRestMinutes) {
      return true;
    }
  }

  return false;
}

function canUseSlotByRest(match, slot, playerDayIntervals, minRestMinutes) {
  for (const playerId of (match.restPlayers || [])) {
    const key = `${playerId}|${slot.dateKey}`;
    const intervals = playerDayIntervals.get(key) || [];
    if (hasRestConflict(intervals, slot, minRestMinutes)) {
      return false;
    }
  }
  return true;
}

function canUseSlotByDependencies(match, slot, minRestMinutes) {
  const dependencies = match.dependencies || [];

  for (const dep of dependencies) {
    if (!dep || !dep.assignedSlot) continue;

    const depSlot = dep.assignedSlot;
    if (slot.startDate.getTime() <= depSlot.startDate.getTime()) {
      return false;
    }

    if (slot.dateKey === depSlot.dateKey) {
      const gap = slot.startMin - depSlot.endMin;
      if (gap < minRestMinutes) {
        return false;
      }
    }
  }

  return true;
}

function findBestSlot({ slots, usedSlotIds, match, preferredDay, minRestMinutes, playerDayIntervals, extraCheck }) {
  let firstValid = null;
  let firstPreferred = null;

  for (const slot of slots) {
    if (usedSlotIds.has(slot.id)) continue;

    if (!canUseSlotByRest(match, slot, playerDayIntervals, minRestMinutes)) continue;
    if (!canUseSlotByDependencies(match, slot, minRestMinutes)) continue;
    if (typeof extraCheck === 'function' && !extraCheck(slot)) continue;

    if (!firstValid) {
      firstValid = slot;
    }

    if (preferredDay !== null && preferredDay !== undefined && slot.dayOfWeek === preferredDay) {
      firstPreferred = slot;
      break;
    }
  }

  return firstPreferred || firstValid;
}

function assignSlotToMatch(match, slot, usedSlotIds, playerDayIntervals) {
  match.fecha_hora = slot.startDate.toISOString();
  match.cancha_id = slot.cancha_id;
  match.assignedSlot = slot;
  usedSlotIds.add(slot.id);

  for (const playerId of (match.restPlayers || [])) {
    const key = `${playerId}|${slot.dateKey}`;
    const list = playerDayIntervals.get(key) || [];
    list.push({ startMin: slot.startMin, endMin: slot.endMin });
    playerDayIntervals.set(key, list);
  }
}

function makeRoundMatch({ torneoId, rondaOrden, jugador1Id = null, jugador2Id = null, ganadorId = null, estado = 'programado', notas = null, candidatePlayers = [], dependencies = [] }) {
  return {
    torneo_id: torneoId,
    ronda: getRoundName(rondaOrden),
    ronda_orden: rondaOrden,
    jugador1_id: jugador1Id,
    jugador2_id: jugador2Id,
    ganador_id: ganadorId,
    fecha_hora: null,
    cancha_id: null,
    estado,
    notas,
    candidatePlayers: [...new Set(candidatePlayers.filter(Boolean))],
    restPlayers: [...new Set(candidatePlayers.filter(Boolean))],
    dependencies,
    assignedSlot: null,
  };
}

async function fetchProfilesWithRankingFallback(jugadorIds) {
  if (!jugadorIds || jugadorIds.length === 0) {
    return { data: [], error: null };
  }

  const profileSelectOptions = [
    'id, nombre_completo, ranking_puntos, ranking_puntos_singles, ranking_puntos_dobles',
    'id, nombre_completo, ranking_puntos, ranking_puntos_singles',
    'id, nombre_completo, ranking_puntos',
    'id, nombre_completo, ranking_puntos_singles, ranking_puntos_dobles',
    'id, nombre_completo, ranking_puntos_singles',
    'id, nombre_completo, ranking_puntos_dobles',
    'id, nombre_completo',
  ];

  let lastError = null;

  for (const selectColumns of profileSelectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(selectColumns)
      .in('id', jugadorIds);

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;

    const isMissingColumn = error.code === '42703' || /column .* does not exist/i.test(error.message || '');
    if (!isMissingColumn) {
      break;
    }
  }

  return { data: [], error: lastError };
}

function normalizeTournamentModalidad(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'dobles' || normalized === 'double' || normalized === 'doubles') return 'Dobles';
  return 'Singles';
}

function resolveSeedPoints(perfil = {}, modalidad = 'Singles') {
  const raw = modalidad === 'Dobles'
    ? (perfil.ranking_puntos_dobles ?? perfil.ranking_puntos)
    : (perfil.ranking_puntos_singles ?? perfil.ranking_puntos);

  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function addPlayerInterval(playerDayIntervals, playerId, slot) {
  if (!playerId || !slot) return;
  const key = `${playerId}|${slot.dateKey}`;
  const list = playerDayIntervals.get(key) || [];
  list.push({ startMin: slot.startMin, endMin: slot.endMin });
  playerDayIntervals.set(key, list);
}

function reserveFixedSlot(match, slot, usedSlotIds, playerDayIntervals) {
  if (!slot || usedSlotIds.has(slot.id)) return false;
  usedSlotIds.add(slot.id);
  addPlayerInterval(playerDayIntervals, match.jugador1_id, slot);
  addPlayerInterval(playerDayIntervals, match.jugador2_id, slot);
  match.assignedSlot = slot;
  return true;
}

function mapSlotsByKey(slots) {
  const map = new Map();
  for (const slot of slots) {
    map.set(`${slot.cancha_id}|${slot.startDate.toISOString()}`, slot);
  }
  return map;
}

/**
 * Genera el orden correcto del bracket asegurando que los Top Seeds (1 y 2)
 * solo se encuentren en la final.
 */
function generarBracket(seeds) {
   const size = seeds.length; // Debe ser potencia de 2
   if (size === 1) return [0]; // Indice si el tornero de 1 (edge case)

   // Arrancamos el bracket para 2
   let brackets = [1, 2];

   // Lo expandimos de 2 en 2 multiplicando hasta emparejar size (ej 2->4->8->16)
   // La fórmula mágica para bracket de tenis invertido
   while (brackets.length < size) {
     const nextBrackets = [];
     const nextSize = brackets.length * 2;
     const sumObj = nextSize + 1;
     
     for (let i = 0; i < brackets.length; i++) {
        // Enlaza [A, (NextSize+1 - A)]
        nextBrackets.push(brackets[i]);
        nextBrackets.push(sumObj - brackets[i]);
     }
     brackets = nextBrackets;
   }
   
   // Los brackets son el ORDEN. Ej [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
   // Devuelvo en pares para hacer cruce. Los índices reales de array son bracket val - 1
   const matches = [];
   for (let i = 0; i < size; i += 2) {
      matches.push([brackets[i] - 1, brackets[i+1] - 1]);
   }
   
   return matches;
}

const generarSorteo = async (req, res) => {
  try {
    const { id: torneo_id } = req.params;
    const schedulerConfig = parseSchedulerConfig(req.body || {});
    if (schedulerConfig.error) {
      return res.status(400).json({ error: schedulerConfig.error });
    }

    const { data: torneo, error: errT } = await supabase.from('torneos').select('*').eq('id', torneo_id).single();
    if (errT || !torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const fechaInicio = parseIsoToUtcDateOnly(torneo.fecha_inicio);
    const fechaFin = parseIsoToUtcDateOnly(torneo.fecha_fin) || fechaInicio;

    if (!fechaInicio || !fechaFin || fechaFin.getTime() < fechaInicio.getTime()) {
      return res.status(400).json({ error: 'El torneo no tiene un rango de fechas valido.' });
    }

    // Verificar que no existan partidos ya generados para este torneo
    const { count: partidosExistentes } = await supabase
      .from('partidos')
      .select('*', { count: 'exact', head: true })
      .eq('torneo_id', torneo_id);
    
    if (partidosExistentes && partidosExistentes > 0) {
      return res.status(400).json({ 
        error: 'Este torneo ya tiene un sorteo generado. Para regenerarlo, primero elimina los partidos existentes desde el panel de Supabase.' 
      });
    }

    const { data: torneoCanchas, error: errTC } = await supabase
      .from('torneo_canchas')
      .select('cancha_id')
      .eq('torneo_id', torneo_id);

    if (errTC) {
      console.error('Error al obtener canchas del torneo:', errTC);
      return res.status(500).json({ error: 'Error al obtener canchas del torneo.' });
    }

    const canchaIdsVinculadas = [...new Set((torneoCanchas || []).map((row) => row.cancha_id).filter(Boolean))];
    if (canchaIdsVinculadas.length === 0) {
      return res.status(400).json({ error: 'El torneo no tiene canchas vinculadas en torneo_canchas.' });
    }

    const { data: canchasDisponiblesRaw, error: errC } = await supabase
      .from('canchas')
      .select('id')
      .in('id', canchaIdsVinculadas)
      .eq('esta_disponible', true);

    if (errC) {
      console.error('Error al validar canchas del torneo:', errC);
      return res.status(500).json({ error: 'Error al validar canchas del torneo.' });
    }

    const canchasDisponibles = (canchasDisponiblesRaw || []).map((c) => c.id);
    if (canchasDisponibles.length === 0) {
      return res.status(400).json({ error: 'No hay canchas disponibles para el torneo.' });
    }

    // 1. Obtener inscritos CON PAGO CONFIRMADO
    const { data: inscripcionesConfirmadas, error: errI } = await supabase
      .from('inscripciones')
      .select('jugador_id')
      .eq('torneo_id', torneo_id)
      .eq('estado', 'confirmada')
      .eq('pago_confirmado', true);

    if (errI) {
      console.error('Error al obtener inscripciones:', errI);
      return res.status(500).json({ error: 'Error al obtener inscripciones', details: errI.message });
    }
    
    const jugadorIds = [...new Set((inscripcionesConfirmadas || []).map((i) => i.jugador_id).filter(Boolean))];

    if (jugadorIds.length < 2) {
      return res.status(400).json({ error: 'Se requiere un mínimo de 2 jugadores con pago confirmado.' });
    }

    const { data: perfilesInscritos, error: perfilesError } = await fetchProfilesWithRankingFallback(jugadorIds);
    if (perfilesError) {
      console.error('Error al obtener perfiles de inscritos:', perfilesError);
      return res.status(500).json({ error: 'Error al obtener perfiles de inscritos', details: perfilesError.message });
    }

    const modalidadTorneo = normalizeTournamentModalidad(torneo?.modalidad);

    const perfilByJugadorId = new Map(
      (perfilesInscritos || []).map((p) => [
        p.id,
        {
          id: p.id,
          nombre_completo: p.nombre_completo,
          ranking_puntos: resolveSeedPoints(p, modalidadTorneo),
        },
      ]),
    );

    // Priorizar disponibilidad por inscripcion del torneo
    const { data: disponibilidadInscripcion, error: errDispInsc } = await supabase
      .from('disponibilidad_inscripcion')
      .select('jugador_id, fecha, dia_semana, hora_inicio, hora_fin')
      .eq('torneo_id', torneo_id)
      .in('jugador_id', jugadorIds);

    if (errDispInsc) {
      console.error('Error al obtener disponibilidad de inscripcion:', errDispInsc);
      return res.status(500).json({ error: 'Error al obtener disponibilidades del torneo.' });
    }

    const dispInscripcionMap = normalizeAvailabilityRows(disponibilidadInscripcion || []);
    const jugadoresSinDisponibilidadInscripcion = jugadorIds.filter((id) => !dispInscripcionMap.has(id));

    let disponibilidadLegacyMap = new Map();
    if (jugadoresSinDisponibilidadInscripcion.length > 0) {
      const { data: disponibilidadLegacy, error: errD } = await supabase
        .from('disponibilidad_jugador')
        .select('jugador_id, dia_semana, hora_inicio, hora_fin')
        .in('jugador_id', jugadoresSinDisponibilidadInscripcion);

      if (errD) {
        console.error('Error al obtener disponibilidad legacy:', errD);
        return res.status(500).json({ error: 'Error al obtener disponibilidades' });
      }

      disponibilidadLegacyMap = normalizeAvailabilityRows(disponibilidadLegacy || []);
    }

    const disponibilidadPorJugador = new Map();
    for (const jugadorId of jugadorIds) {
      const records = dispInscripcionMap.get(jugadorId) || disponibilidadLegacyMap.get(jugadorId) || [];
      disponibilidadPorJugador.set(jugadorId, records);
    }

    // 2. Ordenar por Ranking de puntos (Mayor a Menor) para sembrar
    const jugadoresOrdenados = jugadorIds
      .map((jugadorId) => ({
        jugador_id: jugadorId,
        perfil: perfilByJugadorId.get(jugadorId) || { id: jugadorId, nombre_completo: null, ranking_puntos: 0 },
        disponibilidad_jugador: disponibilidadPorJugador.get(jugadorId) || [],
      }))
      .sort((a, b) => {
        const diff = (b.perfil.ranking_puntos || 0) - (a.perfil.ranking_puntos || 0);
        if (diff !== 0) return diff;

        const aName = String(a.perfil.nombre_completo || '').trim().toLowerCase();
        const bName = String(b.perfil.nombre_completo || '').trim().toLowerCase();
        if (aName !== bName) return aName.localeCompare(bName);

        return String(a.jugador_id || '').localeCompare(String(b.jugador_id || ''));
      });

    // 3. Definir tamano de cuadro segun capacidad del torneo (sin perder inscritos actuales).
    const inscritosCount = jugadoresOrdenados.length;
    const cuposMax = Number.parseInt(String(torneo?.cupos_max ?? ''), 10);
    const targetSlots = Number.isInteger(cuposMax) && cuposMax > 0
      ? Math.max(cuposMax, inscritosCount)
      : inscritosCount;

    let bracketSize = 2;
    while (bracketSize < targetSlots) bracketSize *= 2;

    const completados = [...jugadoresOrdenados];
    const byesNeeded = bracketSize - inscritosCount;
    
    // Anadimos objetos "BYE" fantasma al final del array
    for (let i = 0; i < byesNeeded; i++) {
       completados.push({ isBye: true });
    }

    // 4. Armar cuadro completo
    const paresDeBracketIdces = generarBracket(completados);

    const rounds = new Map();
    const firstRoundMatches = [];

    for (const pair of paresDeBracketIdces) {
      const j1 = completados[pair[0]];
      const j2 = completados[pair[1]];

      if (j1.isBye && j2.isBye) {
        firstRoundMatches.push(makeRoundMatch({
          torneoId: torneo_id,
          rondaOrden: bracketSize,
          estado: 'finalizado',
          notas: 'Llave vacia por BYE',
          candidatePlayers: [],
        }));
        continue;
      }

      if (j2.isBye) {
        firstRoundMatches.push(makeRoundMatch({
          torneoId: torneo_id,
          rondaOrden: bracketSize,
          jugador1Id: j1.jugador_id,
          ganadorId: j1.jugador_id,
          estado: 'finalizado',
          notas: 'Avanza por BYE',
          candidatePlayers: [j1.jugador_id],
        }));
        continue;
      }

      if (j1.isBye) {
        firstRoundMatches.push(makeRoundMatch({
          torneoId: torneo_id,
          rondaOrden: bracketSize,
          jugador2Id: j2.jugador_id,
          ganadorId: j2.jugador_id,
          estado: 'finalizado',
          notas: 'Avanza por BYE',
          candidatePlayers: [j2.jugador_id],
        }));
        continue;
      }

      firstRoundMatches.push(makeRoundMatch({
        torneoId: torneo_id,
        rondaOrden: bracketSize,
        jugador1Id: j1.jugador_id,
        jugador2Id: j2.jugador_id,
        candidatePlayers: [j1.jugador_id, j2.jugador_id],
      }));
    }

    rounds.set(bracketSize, firstRoundMatches);

    let previousRound = firstRoundMatches;
    for (let currentOrder = bracketSize / 2; currentOrder >= 2; currentOrder /= 2) {
      const currentRound = [];

      for (let i = 0; i < previousRound.length; i += 2) {
        const left = previousRound[i];
        const right = previousRound[i + 1];

        const leftCandidates = new Set(left ? left.candidatePlayers : []);
        const rightCandidates = new Set(right ? right.candidatePlayers : []);
        const candidatePlayers = [...new Set([...leftCandidates, ...rightCandidates])];

        let jugador1Id = left ? (left.ganador_id || null) : null;
        let jugador2Id = right ? (right.ganador_id || null) : null;
        let ganadorId = null;
        let estado = 'programado';
        let notas = null;

        if (jugador1Id && !jugador2Id && rightCandidates.size === 0) {
          ganadorId = jugador1Id;
          estado = 'finalizado';
          notas = 'Avanza por BYE';
        } else if (jugador2Id && !jugador1Id && leftCandidates.size === 0) {
          ganadorId = jugador2Id;
          estado = 'finalizado';
          notas = 'Avanza por BYE';
        } else if (!jugador1Id && !jugador2Id && candidatePlayers.length === 0) {
          estado = 'finalizado';
          notas = 'Llave vacia por BYE';
        }

        currentRound.push(makeRoundMatch({
          torneoId: torneo_id,
          rondaOrden: currentOrder,
          jugador1Id,
          jugador2Id,
          ganadorId,
          estado,
          notas,
          candidatePlayers,
          dependencies: [left, right].filter(Boolean),
        }));
      }

      rounds.set(currentOrder, currentRound);
      previousRound = currentRound;
    }

    // 5. Generar slots por dia/cancha
    const tournamentDays = listTournamentDays(fechaInicio, fechaFin);
    const slots = buildSlots({
      days: tournamentDays,
      canchaIds: canchasDisponibles,
      horaInicioMin: schedulerConfig.horaInicioMin,
      horaFinMin: schedulerConfig.horaFinMin,
      duracionTurno: schedulerConfig.duracionTurno,
    });

    if (slots.length === 0) {
      return res.status(400).json({ error: 'No fue posible generar slots con la configuracion horaria indicada.' });
    }

    const usedSlotIds = new Set();
    const playerDayIntervals = new Map();

    // 6. Asignar R1 segun disponibilidad real de ambos jugadores
    for (const match of (rounds.get(bracketSize) || [])) {
      if (match.estado === 'finalizado') {
        continue;
      }

      if (!match.jugador1_id || !match.jugador2_id) {
        match.notas = appendNote(match.notas, 'Partido sin ambos jugadores definidos');
        continue;
      }

      const selectedSlot = findBestSlot({
        slots,
        usedSlotIds,
        match,
        preferredDay: null,
        minRestMinutes: MIN_REST_MINUTES,
        playerDayIntervals,
        extraCheck: (slot) => {
          const disp1 = disponibilidadPorJugador.get(match.jugador1_id) || [];
          const disp2 = disponibilidadPorJugador.get(match.jugador2_id) || [];
          return isPlayerAvailableAt(disp1, slot) && isPlayerAvailableAt(disp2, slot);
        },
      });

      if (!selectedSlot) {
        match.notas = appendNote(match.notas, 'Conflicto de horarios para R1');
        continue;
      }

      assignSlotToMatch(match, selectedSlot, usedSlotIds, playerDayIntervals);
    }

    // 7. Asignar rondas siguientes con prioridad de fin de semana
    const nextRoundOrders = [...rounds.keys()]
      .filter((order) => order < bracketSize)
      .sort((a, b) => b - a);

    for (const order of nextRoundOrders) {
      for (const match of rounds.get(order) || []) {
        if (match.estado === 'finalizado') {
          continue;
        }

        const preferredDay = order === 2
          ? 0
          : (order <= 8 && order >= 4 ? 6 : null);

        const selectedSlot = findBestSlot({
          slots,
          usedSlotIds,
          match,
          preferredDay,
          minRestMinutes: MIN_REST_MINUTES,
          playerDayIntervals,
        });

        if (!selectedSlot) {
          if (order === 2) {
            match.notas = appendNote(match.notas, 'Sin slot disponible para Final');
          } else {
            match.notas = appendNote(match.notas, 'Sin slot disponible para ronda intermedia');
          }
          continue;
        }

        assignSlotToMatch(match, selectedSlot, usedSlotIds, playerDayIntervals);
      }
    }

    const matchesToInsert = [...rounds.keys()]
      .sort((a, b) => b - a)
      .flatMap((order) => rounds.get(order) || [])
      .map((match) => ({
        torneo_id: match.torneo_id,
        ronda: match.ronda,
        ronda_orden: match.ronda_orden,
        jugador1_id: match.jugador1_id,
        jugador2_id: match.jugador2_id,
        ganador_id: match.ganador_id,
        fecha_hora: match.fecha_hora,
        cancha_id: match.cancha_id,
        estado: match.estado,
        notas: match.notas,
      }));

    // Insertar en la tabla partidos
    const { data: partidosInsertados, error: errP } = await supabase
      .from('partidos')
      .insert(matchesToInsert)
      .select();

    if (errP) {
      console.error('Error insertando partidos:', errP);
      return res.status(500).json({ error: 'Error al generar el cuadro de torneo.' });
    }

    // Actualizar estado del torneo a 'en_progreso'
    await supabase.from('torneos').update({ estado: 'en_progreso' }).eq('id', torneo_id);

    const totalPartidos = matchesToInsert.length;
    const partidosConSlot = matchesToInsert.filter((p) => p.fecha_hora && p.cancha_id).length;
    const partidosSinSlot = totalPartidos - partidosConSlot;

    return res.json({ 
      message: 'Sorteo y cronograma generados exitosamente.',
      config: {
        hora_inicio_dia: schedulerConfig.horaInicioDia,
        hora_fin_dia: schedulerConfig.horaFinDia,
        duracion_turno: schedulerConfig.duracionTurno,
        descanso_minimo_entre_partidos: MIN_REST_MINUTES,
      },
      resumen: {
        total_partidos: totalPartidos,
        partidos_con_slot: partidosConSlot,
        partidos_sin_slot: partidosSinSlot,
      },
      partidos: partidosInsertados
    });

  } catch (err) {
    console.error('Error en sorteo alg:', err);
    res.status(500).json({ error: 'Error interno de servidor' });
  }
};

const fetchPartidosCuadroCompat = async (torneoId) => {
  const selectOptions = [
    {
      columns: 'id, torneo_id, ronda, ronda_orden, orden_en_ronda, estado, fecha_hora, cancha_id, marcador_en_vivo, score, resultado, ganador_id, jugador1_id, jugador2_id, jugador1_origen_partido_id, jugador2_origen_partido_id, notas',
      withOrderInRound: true,
    },
    {
      columns: 'id, torneo_id, ronda, ronda_orden, orden_en_ronda, estado, fecha_hora, cancha_id, marcador_en_vivo, ganador_id, jugador1_id, jugador2_id, notas',
      withOrderInRound: true,
    },
    {
      columns: 'id, torneo_id, ronda, ronda_orden, estado, fecha_hora, cancha_id, ganador_id, jugador1_id, jugador2_id, notas',
      withOrderInRound: false,
    },
  ];

  let lastError = null;
  for (const option of selectOptions) {
    let query = supabase
      .from('partidos')
      .select(option.columns)
      .eq('torneo_id', torneoId)
      .order('ronda_orden', { ascending: false });

    if (option.withOrderInRound) {
      query = query.order('orden_en_ronda', { ascending: true, nullsFirst: false });
    }

    const { data, error } = await query
      .order('fecha_hora', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;
    const isMissingColumn = error.code === '42703' || /column .* does not exist/i.test(error.message || '');
    if (!isMissingColumn) {
      break;
    }
  }

  return { data: [], error: lastError };
};

const parsePositiveIntCompat = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeEntityIdCompat = (value) => String(value || '').trim().toLowerCase();

const sameEntityIdCompat = (a, b) => {
  const left = normalizeEntityIdCompat(a);
  const right = normalizeEntityIdCompat(b);
  if (!left || !right) return false;
  return left === right;
};

const winnerBelongsToMatchCompat = (match) => {
  if (!match?.ganador_id) return false;
  return sameEntityIdCompat(match.ganador_id, match.jugador1_id)
    || sameEntityIdCompat(match.ganador_id, match.jugador2_id);
};

const compareCuadroMatch = (a, b) => {
  const ao = parsePositiveIntCompat(a.orden_en_ronda);
  const bo = parsePositiveIntCompat(b.orden_en_ronda);
  const safeAo = ao === null ? Number.MAX_SAFE_INTEGER : ao;
  const safeBo = bo === null ? Number.MAX_SAFE_INTEGER : bo;
  if (safeAo !== safeBo) return safeAo - safeBo;

  const at = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Number.MAX_SAFE_INTEGER;
  const bt = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Number.MAX_SAFE_INTEGER;
  if (at !== bt) return at - bt;

  const ac = String(a.cancha_id || '');
  const bc = String(b.cancha_id || '');
  if (ac !== bc) return ac.localeCompare(bc);

  return String(a.id).localeCompare(String(b.id));
};

const parseMarcadorPersistido = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return String(value);
};

const normalizeSetPair = (setValue) => {
  if (!setValue) return null;

  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  if (Array.isArray(setValue) && setValue.length >= 2) {
    const a = toNumber(setValue[0]);
    const b = toNumber(setValue[1]);
    if (a !== null && b !== null) return [a, b];
  }

  if (typeof setValue === 'object') {
    const p1 = setValue.j1 ?? setValue.jugador1 ?? setValue.player1 ?? setValue.local ?? setValue.a;
    const p2 = setValue.j2 ?? setValue.jugador2 ?? setValue.player2 ?? setValue.visitante ?? setValue.b;
    const a = toNumber(p1);
    const b = toNumber(p2);
    if (a !== null && b !== null) return [a, b];
  }

  return null;
};

const deriveResultadoDesdeMarcador = (marcador) => {
  if (!marcador || typeof marcador !== 'object' || Array.isArray(marcador)) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(marcador, 'resultado')) {
    return marcador.resultado;
  }

  const rawSets = Array.isArray(marcador.sets) ? marcador.sets : null;
  const sets = (rawSets || [])
    .map((s) => normalizeSetPair(s))
    .filter(Boolean);

  if (sets.length > 0) {
    return { sets };
  }

  const ganadorId = marcador.ganador_id ?? marcador.ganadorId ?? marcador.winner_id ?? null;
  if (ganadorId) {
    return { ganador_id: ganadorId };
  }

  return null;
};

const deriveScoreDesdeMarcador = (marcador, resultadoDerivado) => {
  if (typeof marcador === 'string') {
    return marcador;
  }

  if (!marcador || typeof marcador !== 'object' || Array.isArray(marcador)) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(marcador, 'score')) {
    const rawScore = marcador.score;
    if (rawScore == null) return null;
    if (typeof rawScore === 'string') return rawScore;
    try {
      return JSON.stringify(rawScore);
    } catch {
      return String(rawScore);
    }
  }

  const sets = Array.isArray(resultadoDerivado?.sets) ? resultadoDerivado.sets : [];
  if (sets.length > 0) {
    return sets.map(([a, b]) => `${a}-${b}`).join(' ');
  }

  return null;
};

const resolveScoreResultadoPartido = (partido) => {
  let score = partido.score ?? null;
  let resultado = partido.resultado ?? null;

  if (score !== null && resultado !== null) {
    return { score, resultado };
  }

  const marcador = parseMarcadorPersistido(partido.marcador_en_vivo);
  if (!marcador) {
    return { score, resultado };
  }

  if (resultado == null) {
    resultado = deriveResultadoDesdeMarcador(marcador);
  }

  if (score == null) {
    score = deriveScoreDesdeMarcador(marcador, resultado);
  }

  return {
    score: score ?? null,
    resultado: resultado ?? null,
  };
};

const obtenerCuadroTorneo = async (req, res) => {
  try {
    const torneoId = req.params.id;

    if (!UUID_REGEX.test(torneoId)) {
      return res.status(400).json({ error: 'El torneoId es invalido.' });
    }

    const { data: torneo, error: torneoError } = await supabase
      .from('torneos')
      .select('id')
      .eq('id', torneoId)
      .single();

    if (torneoError || !torneo) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const { data: partidosRaw, error } = await fetchPartidosCuadroCompat(torneoId);
    if (error) {
      console.error('Error al obtener cuadro:', {
        torneoId,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return res.status(500).json({ error: 'Error al obtener cuadro' });
    }

    if (!partidosRaw || partidosRaw.length === 0) {
      console.info('Cuadro consultado sin partidos:', { torneoId, cantidadPartidos: 0 });
      return res.status(200).json([]);
    }

    const workingMatches = (partidosRaw || []).map((p) => ({ ...p }));

    const rounds = new Map();
    for (const match of workingMatches) {
      const order = parsePositiveIntCompat(match.ronda_orden);
      if (order === null) continue;
      if (!rounds.has(order)) rounds.set(order, []);
      rounds.get(order).push(match);
    }

    const roundOrders = [...rounds.keys()].sort((a, b) => b - a);
    for (const order of roundOrders) {
      const sorted = rounds.get(order).slice().sort(compareCuadroMatch);
      for (let i = 0; i < sorted.length; i += 1) {
        const parsedOrder = parsePositiveIntCompat(sorted[i].orden_en_ronda);
        if (parsedOrder === null) {
          sorted[i].orden_en_ronda = i + 1;
        } else {
          sorted[i].orden_en_ronda = parsedOrder;
        }

        if (sorted[i].ganador_id && !winnerBelongsToMatchCompat(sorted[i])) {
          sorted[i].ganador_id = null;
        }
      }
      rounds.set(order, sorted);
    }

    for (let i = 0; i < roundOrders.length - 1; i += 1) {
      const prevOrder = roundOrders[i];
      const currentOrder = roundOrders[i + 1];
      const prevRound = rounds.get(prevOrder) || [];
      const currentRound = rounds.get(currentOrder) || [];
      const prevById = new Map(prevRound.map((match) => [normalizeEntityIdCompat(match.id), match]));

      for (let idx = 0; idx < currentRound.length; idx += 1) {
        const current = currentRound[idx];
        const sourceFromIndex1 = prevRound[idx * 2] || null;
        const sourceFromIndex2 = prevRound[idx * 2 + 1] || null;

        const sourceFromOrigin1 = current.jugador1_origen_partido_id
          ? (prevById.get(normalizeEntityIdCompat(current.jugador1_origen_partido_id)) || null)
          : null;
        const sourceFromOrigin2 = current.jugador2_origen_partido_id
          ? (prevById.get(normalizeEntityIdCompat(current.jugador2_origen_partido_id)) || null)
          : null;

        const source1 = sourceFromOrigin1 || sourceFromIndex1;
        const source2 = sourceFromOrigin2 || sourceFromIndex2;

        if (!current.jugador1_origen_partido_id && source1?.id) {
          current.jugador1_origen_partido_id = source1.id;
        }
        if (!current.jugador2_origen_partido_id && source2?.id) {
          current.jugador2_origen_partido_id = source2.id;
        }

        const source1Winner = source1?.ganador_id && winnerBelongsToMatchCompat(source1)
          ? source1.ganador_id
          : null;
        const source2Winner = source2?.ganador_id && winnerBelongsToMatchCompat(source2)
          ? source2.ganador_id
          : null;

        if (source1 || current.jugador1_origen_partido_id) {
          current.jugador1_id = source1Winner || null;
        }
        if (source2 || current.jugador2_origen_partido_id) {
          current.jugador2_id = source2Winner || null;
        }

        if (current.ganador_id && !winnerBelongsToMatchCompat(current)) {
          current.ganador_id = null;
          if (String(current.estado || '').trim().toLowerCase() === 'finalizado') {
            current.estado = 'programado';
          }
        }
      }
    }

    const jugadorIds = [...new Set(
      [...workingMatches]
        .flatMap((p) => [p.jugador1_id, p.jugador2_id, p.ganador_id])
        .filter(Boolean),
    )];

    const canchaIds = [...new Set(workingMatches.map((p) => p.cancha_id).filter(Boolean))];

    let perfilesRaw = [];
    if (jugadorIds.length > 0) {
      const profileSelectOptions = [
        'id, nombre_completo, ranking_elo, ranking_elo_singles, ranking_elo_dobles',
        'id, nombre_completo, ranking_elo, ranking_elo_singles',
        'id, nombre_completo, ranking_elo',
        'id, nombre_completo, ranking_elo_singles, ranking_elo_dobles',
        'id, nombre_completo, ranking_elo_singles',
        'id, nombre_completo, ranking_elo_dobles',
        'id, nombre_completo',
      ];

      let perfilesError = null;

      for (const selectColumns of profileSelectOptions) {
        const { data: perfilesData, error: currentError } = await supabase
          .from('perfiles')
          .select(selectColumns)
          .in('id', jugadorIds);

        if (!currentError) {
          perfilesRaw = perfilesData || [];
          perfilesError = null;
          break;
        }

        perfilesError = currentError;
        const isMissingColumn = currentError.code === '42703' || /column .* does not exist/i.test(currentError.message || '');
        if (!isMissingColumn) {
          break;
        }
      }

      if (perfilesError) {
        console.error('Error al obtener perfiles para cuadro:', {
          torneoId,
          message: perfilesError.message,
          details: perfilesError.details,
          hint: perfilesError.hint,
          code: perfilesError.code,
        });
        return res.status(500).json({ error: 'Error al obtener cuadro' });
      }
    }

    let canchasRaw = [];
    if (canchaIds.length > 0) {
      const { data: canchasData, error: canchasError } = await supabase
        .from('canchas')
        .select('id, nombre')
        .in('id', canchaIds);

      if (canchasError) {
        console.error('Error al obtener canchas para cuadro:', {
          torneoId,
          message: canchasError.message,
          details: canchasError.details,
          hint: canchasError.hint,
          code: canchasError.code,
        });
        return res.status(500).json({ error: 'Error al obtener cuadro' });
      }

      canchasRaw = canchasData || [];
    }

    const perfilById = new Map(
      perfilesRaw.map((p) => {
        const rankingBase = p.ranking_elo ?? p.ranking_elo_singles ?? p.ranking_elo_dobles ?? null;
        return [
          p.id,
          {
            id: p.id,
            nombre_completo: p.nombre_completo ?? null,
            ranking_elo: rankingBase,
          },
        ];
      }),
    );

    const canchaById = new Map(
      canchasRaw.map((c) => [
        c.id,
        {
          id: c.id,
          nombre: c.nombre ?? null,
        },
      ]),
    );

    const flattened = roundOrders.flatMap((order) => rounds.get(order) || []);
    const data = flattened.map((p) => {
      const jugador1 = p.jugador1_id ? (perfilById.get(p.jugador1_id) || { id: p.jugador1_id, nombre_completo: null, ranking_elo: null }) : null;
      const jugador2 = p.jugador2_id ? (perfilById.get(p.jugador2_id) || { id: p.jugador2_id, nombre_completo: null, ranking_elo: null }) : null;
      const resolvedResultado = resolveScoreResultadoPartido(p);

      return {
        id: p.id,
        torneo_id: p.torneo_id ?? torneoId,
        ronda: p.ronda,
        ronda_orden: p.ronda_orden,
        orden_en_ronda: p.orden_en_ronda ?? null,
        estado: p.estado ?? null,
        fecha_hora: p.fecha_hora ?? null,
        cancha_id: p.cancha_id ?? null,
        cancha: p.cancha_id ? (canchaById.get(p.cancha_id) || { id: p.cancha_id, nombre: null }) : null,
        marcador_en_vivo: p.marcador_en_vivo ?? null,
        score: resolvedResultado.score,
        resultado: resolvedResultado.resultado,
        ganador_id: p.ganador_id ?? null,
        jugador1_id: p.jugador1_id ?? null,
        jugador2_id: p.jugador2_id ?? null,
        jugador1_nombre: jugador1?.nombre_completo ?? null,
        jugador2_nombre: jugador2?.nombre_completo ?? null,
        jugador1,
        jugador2,
        jugador1_origen_partido_id: p.jugador1_origen_partido_id ?? null,
        jugador2_origen_partido_id: p.jugador2_origen_partido_id ?? null,
        notas: p.notas ?? null,
      };
    });

    console.info('Cuadro obtenido correctamente:', { torneoId, cantidadPartidos: data.length });
    return res.status(200).json(data);
  } catch (err) {
    console.error('Error inesperado al obtener cuadro:', {
      torneoId: req.params.id,
      message: err.message,
      stack: err.stack,
    });
    return res.status(500).json({ error: 'Error al obtener cuadro' });
  }
};

const recalcularCronograma = async (req, res) => {
  try {
    const { id: torneo_id } = req.params;

    if (!UUID_REGEX.test(torneo_id)) {
      return res.status(400).json({ error: 'El torneoId es invalido.' });
    }

    const schedulerConfig = parseSchedulerConfig(req.body || {});
    if (schedulerConfig.error) {
      return res.status(400).json({ error: schedulerConfig.error });
    }

    const { data: torneo, error: errT } = await supabase
      .from('torneos')
      .select('id, fecha_inicio, fecha_fin')
      .eq('id', torneo_id)
      .single();

    if (errT || !torneo) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const fechaInicio = parseIsoToUtcDateOnly(torneo.fecha_inicio);
    const fechaFin = parseIsoToUtcDateOnly(torneo.fecha_fin) || fechaInicio;
    if (!fechaInicio || !fechaFin || fechaFin.getTime() < fechaInicio.getTime()) {
      return res.status(400).json({ error: 'El torneo no tiene un rango de fechas valido.' });
    }

    const { data: torneoCanchas, error: errTC } = await supabase
      .from('torneo_canchas')
      .select('cancha_id')
      .eq('torneo_id', torneo_id);

    if (errTC) {
      console.error('Error al obtener canchas del torneo:', errTC);
      return res.status(500).json({ error: 'Error al obtener canchas del torneo.' });
    }

    const canchaIdsVinculadas = [...new Set((torneoCanchas || []).map((row) => row.cancha_id).filter(Boolean))];
    if (canchaIdsVinculadas.length === 0) {
      return res.status(400).json({ error: 'El torneo no tiene canchas vinculadas en torneo_canchas.' });
    }

    const { data: canchasDisponiblesRaw, error: errC } = await supabase
      .from('canchas')
      .select('id')
      .in('id', canchaIdsVinculadas)
      .eq('esta_disponible', true);

    if (errC) {
      console.error('Error al validar canchas del torneo:', errC);
      return res.status(500).json({ error: 'Error al validar canchas del torneo.' });
    }

    const canchasDisponibles = (canchasDisponiblesRaw || []).map((c) => c.id);
    if (canchasDisponibles.length === 0) {
      return res.status(400).json({ error: 'No hay canchas disponibles para el torneo.' });
    }

    const { data: partidosRaw, error: errP } = await supabase
      .from('partidos')
      .select('id, torneo_id, ronda, ronda_orden, jugador1_id, jugador2_id, ganador_id, fecha_hora, cancha_id, estado, notas')
      .eq('torneo_id', torneo_id)
      .order('ronda_orden', { ascending: false })
      .order('id', { ascending: true });

    if (errP) {
      console.error('Error al obtener partidos para cronograma:', errP);
      return res.status(500).json({ error: 'Error al obtener partidos del torneo.' });
    }

    if (!partidosRaw || partidosRaw.length === 0) {
      return res.status(400).json({ error: 'El torneo no tiene partidos para reprogramar.' });
    }

    const jugadorIds = [...new Set(
      partidosRaw
        .flatMap((p) => [p.jugador1_id, p.jugador2_id])
        .filter(Boolean),
    )];

    const { data: disponibilidadInscripcion, error: errDispInsc } = await supabase
      .from('disponibilidad_inscripcion')
      .select('jugador_id, fecha, dia_semana, hora_inicio, hora_fin')
      .eq('torneo_id', torneo_id)
      .in('jugador_id', jugadorIds);

    if (errDispInsc) {
      console.error('Error al obtener disponibilidad de inscripcion:', errDispInsc);
      return res.status(500).json({ error: 'Error al obtener disponibilidades del torneo.' });
    }

    const dispInscripcionMap = normalizeAvailabilityRows(disponibilidadInscripcion || []);
    const jugadoresSinDisponibilidadInscripcion = jugadorIds.filter((id) => !dispInscripcionMap.has(id));

    let disponibilidadLegacyMap = new Map();
    if (jugadoresSinDisponibilidadInscripcion.length > 0) {
      const { data: disponibilidadLegacy, error: errD } = await supabase
        .from('disponibilidad_jugador')
        .select('jugador_id, dia_semana, hora_inicio, hora_fin')
        .in('jugador_id', jugadoresSinDisponibilidadInscripcion);

      if (errD) {
        console.error('Error al obtener disponibilidad legacy:', errD);
        return res.status(500).json({ error: 'Error al obtener disponibilidades' });
      }

      disponibilidadLegacyMap = normalizeAvailabilityRows(disponibilidadLegacy || []);
    }

    const disponibilidadPorJugador = new Map();
    for (const jugadorId of jugadorIds) {
      const records = dispInscripcionMap.get(jugadorId) || disponibilidadLegacyMap.get(jugadorId) || [];
      disponibilidadPorJugador.set(jugadorId, records);
    }

    const workingMatches = partidosRaw.map((p) => ({
      ...p,
      candidatePlayers: [...new Set([p.jugador1_id, p.jugador2_id, p.ganador_id].filter(Boolean))],
      restPlayers: [],
      dependencies: [],
      assignedSlot: null,
    }));

    const rounds = new Map();
    for (const match of workingMatches) {
      if (!rounds.has(match.ronda_orden)) {
        rounds.set(match.ronda_orden, []);
      }
      rounds.get(match.ronda_orden).push(match);
    }

    const roundOrders = [...rounds.keys()].sort((a, b) => b - a);
    const firstRoundOrder = roundOrders[0];

    for (let i = 0; i < roundOrders.length - 1; i += 1) {
      const prevOrder = roundOrders[i];
      const currentOrder = roundOrders[i + 1];
      const prevRound = rounds.get(prevOrder) || [];
      const currentRound = rounds.get(currentOrder) || [];

      for (let idx = 0; idx < currentRound.length; idx += 1) {
        const currentMatch = currentRound[idx];
        const left = prevRound[idx * 2] || null;
        const right = prevRound[idx * 2 + 1] || null;

        currentMatch.dependencies = [left, right].filter(Boolean);

        const dependencyPlayers = [
          ...(left ? left.candidatePlayers : []),
          ...(right ? right.candidatePlayers : []),
        ];

        if (dependencyPlayers.length > 0) {
          currentMatch.candidatePlayers = [...new Set(dependencyPlayers)];
        }
      }
    }

    for (const match of workingMatches) {
      match.restPlayers = [...new Set(match.candidatePlayers.filter(Boolean))];
    }

    const tournamentDays = listTournamentDays(fechaInicio, fechaFin);
    const slots = buildSlots({
      days: tournamentDays,
      canchaIds: canchasDisponibles,
      horaInicioMin: schedulerConfig.horaInicioMin,
      horaFinMin: schedulerConfig.horaFinMin,
      duracionTurno: schedulerConfig.duracionTurno,
    });

    if (slots.length === 0) {
      return res.status(400).json({ error: 'No fue posible generar slots con la configuracion horaria indicada.' });
    }

    const usedSlotIds = new Set();
    const playerDayIntervals = new Map();
    const slotByKey = mapSlotsByKey(slots);

    for (const match of workingMatches) {
      if (match.estado !== 'finalizado' || !match.fecha_hora || !match.cancha_id) {
        continue;
      }

      const iso = new Date(match.fecha_hora).toISOString();
      const slot = slotByKey.get(`${match.cancha_id}|${iso}`);
      reserveFixedSlot(match, slot, usedSlotIds, playerDayIntervals);
    }

    const firstRoundMatches = rounds.get(firstRoundOrder) || [];
    for (const match of firstRoundMatches) {
      if (match.estado === 'finalizado') continue;

      match.fecha_hora = null;
      match.cancha_id = null;

      if (!match.jugador1_id || !match.jugador2_id) {
        match.notas = appendNote(match.notas, 'Partido sin ambos jugadores definidos');
        continue;
      }

      const selectedSlot = findBestSlot({
        slots,
        usedSlotIds,
        match,
        preferredDay: null,
        minRestMinutes: MIN_REST_MINUTES,
        playerDayIntervals,
        extraCheck: (slot) => {
          const disp1 = disponibilidadPorJugador.get(match.jugador1_id) || [];
          const disp2 = disponibilidadPorJugador.get(match.jugador2_id) || [];
          return isPlayerAvailableAt(disp1, slot) && isPlayerAvailableAt(disp2, slot);
        },
      });

      if (!selectedSlot) {
        match.notas = appendNote(match.notas, 'Conflicto de horarios para R1');
        continue;
      }

      assignSlotToMatch(match, selectedSlot, usedSlotIds, playerDayIntervals);
    }

    const nextRoundOrders = roundOrders
      .filter((order) => order < firstRoundOrder)
      .sort((a, b) => b - a);

    for (const order of nextRoundOrders) {
      for (const match of rounds.get(order) || []) {
        if (match.estado === 'finalizado') continue;

        match.fecha_hora = null;
        match.cancha_id = null;

        const preferredDay = order === 2
          ? 0
          : (order <= 8 && order >= 4 ? 6 : null);

        const selectedSlot = findBestSlot({
          slots,
          usedSlotIds,
          match,
          preferredDay,
          minRestMinutes: MIN_REST_MINUTES,
          playerDayIntervals,
        });

        if (!selectedSlot) {
          if (order === 2) {
            match.notas = appendNote(match.notas, 'Sin slot disponible para Final');
          } else {
            match.notas = appendNote(match.notas, 'Sin slot disponible para ronda intermedia');
          }
          continue;
        }

        assignSlotToMatch(match, selectedSlot, usedSlotIds, playerDayIntervals);
      }
    }

    for (const match of workingMatches) {
      if (match.estado === 'finalizado') continue;

      const { error: updateError } = await supabase
        .from('partidos')
        .update({
          fecha_hora: match.fecha_hora,
          cancha_id: match.cancha_id,
          notas: match.notas,
        })
        .eq('id', match.id);

      if (updateError) {
        console.error('Error actualizando cronograma de partido:', {
          partidoId: match.id,
          message: updateError.message,
          code: updateError.code,
        });
        return res.status(500).json({ error: 'Error al actualizar el cronograma de partidos.' });
      }
    }

    const partidosProgramables = workingMatches.filter((m) => m.estado !== 'finalizado');
    const partidosConSlot = partidosProgramables.filter((m) => m.fecha_hora && m.cancha_id).length;

    return res.status(200).json({
      message: 'Cronograma recalculado exitosamente sin regenerar el sorteo.',
      config: {
        hora_inicio_dia: schedulerConfig.horaInicioDia,
        hora_fin_dia: schedulerConfig.horaFinDia,
        duracion_turno: schedulerConfig.duracionTurno,
        descanso_minimo_entre_partidos: MIN_REST_MINUTES,
      },
      resumen: {
        total_partidos: workingMatches.length,
        partidos_reprogramados: partidosProgramables.length,
        partidos_con_slot: partidosConSlot,
        partidos_sin_slot: partidosProgramables.length - partidosConSlot,
      },
    });
  } catch (err) {
    console.error('Error al recalcular cronograma:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const publicarCronograma = async (req, res) => {
  try {
    const { id: torneo_id } = req.params;

    if (!UUID_REGEX.test(torneo_id)) {
      return res.status(400).json({ error: 'El torneoId es invalido.' });
    }

    const { data: torneo, error: errTorneo } = await supabase
      .from('torneos')
      .select('id, estado')
      .eq('id', torneo_id)
      .single();

    if (errTorneo || !torneo) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const { count: totalPartidos, error: errCountTotal } = await supabase
      .from('partidos')
      .select('*', { count: 'exact', head: true })
      .eq('torneo_id', torneo_id);

    if (errCountTotal) {
      console.error('Error al contar partidos del torneo:', errCountTotal);
      return res.status(500).json({ error: 'Error al publicar cronograma' });
    }

    if (!totalPartidos || totalPartidos <= 0) {
      return res.status(400).json({ error: 'El torneo no tiene partidos para publicar.' });
    }

    const { count: partidosSinAsignacion, error: errCountSinAsignacion } = await supabase
      .from('partidos')
      .select('*', { count: 'exact', head: true })
      .eq('torneo_id', torneo_id)
      .or('fecha_hora.is.null,cancha_id.is.null');

    if (errCountSinAsignacion) {
      console.error('Error al contar partidos incompletos del torneo:', errCountSinAsignacion);
      return res.status(500).json({ error: 'Error al publicar cronograma' });
    }

    const targetState = normalizeTournamentStateInput(
      req.body?.estado ?? req.body?.state ?? req.body?.status,
    ) || 'en_progreso';

    const { data: torneoActualizado, error: errUpdate } = await supabase
      .from('torneos')
      .update({ estado: targetState })
      .eq('id', torneo_id)
      .select('id, estado')
      .single();

    if (errUpdate || !torneoActualizado) {
      console.error('Error al actualizar estado del torneo al publicar cronograma:', errUpdate);
      return res.status(500).json({ error: 'Error al publicar cronograma' });
    }

    return res.status(200).json({
      message: 'Cronograma publicado correctamente.',
      torneo: torneoActualizado,
      resumen: {
        total_partidos: Number(totalPartidos || 0),
        partidos_sin_asignacion: Number(partidosSinAsignacion || 0),
      },
    });
  } catch (err) {
    console.error('Error al publicar cronograma:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  generarSorteo,
  obtenerCuadroTorneo,
  recalcularCronograma,
  publicarCronograma,
  __private: {
    parseSchedulerConfig,
    listTournamentDays,
    buildSlots,
    normalizeAvailabilityRows,
    isPlayerAvailableAt,
    hasRestConflict,
    getRoundName,
  },
};
