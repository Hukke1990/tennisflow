const supabase = require('../services/supabase');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ELO_K_FACTOR = 32;
const ROUND_POINTS_FIELD_BY_ORDER = Object.freeze({
  2: 'puntos_ronda_2',
  4: 'puntos_ronda_4',
  8: 'puntos_ronda_8',
  16: 'puntos_ronda_16',
  32: 'puntos_ronda_32',
});
const RANKING_POINTS_FIELD_BY_MODALIDAD = Object.freeze({
  Singles: 'ranking_puntos_singles',
  Dobles: 'ranking_puntos_dobles',
});

const normalizeModalidad = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'single' || normalized === 'singles') return 'Singles';
  if (normalized === 'double' || normalized === 'dobles' || normalized === 'doubles') return 'Dobles';
  return null;
};

const normalizeRama = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'masculino' || normalized === 'male' || normalized === 'm') return 'Masculino';
  if (normalized === 'femenino' || normalized === 'female' || normalized === 'f') return 'Femenino';
  if (normalized === 'mixto' || normalized === 'mixed' || normalized === 'x') return 'Mixto';
  return null;
};

const parseCategoria = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const categoria = Number.parseInt(String(value), 10);
  if (!Number.isInteger(categoria) || categoria < 1 || categoria > 5) return null;
  return categoria;
};

const resolveCategoriaPerfil = (perfil, modalidad) => {
  if (!perfil) return null;
  if (modalidad === 'Dobles') {
    return parseCategoria(perfil.categoria_dobles ?? perfil.categoria);
  }
  return parseCategoria(perfil.categoria_singles ?? perfil.categoria);
};

const expectedScore = (ratingA, ratingB) => 1 / (1 + (10 ** ((ratingB - ratingA) / 400)));

const nextElo = (currentRating, opponentRating, score, kFactor = ELO_K_FACTOR) => {
  const expected = expectedScore(currentRating, opponentRating);
  return Math.round(currentRating + kFactor * (score - expected));
};

const fetchTorneoCompetitivo = async (torneoId) => {
  const selectOptions = [
    'id, modalidad, rama, categoria_id, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon',
    'id, modalidad, categoria_id',
    'id, modalidad, rama',
    'id, modalidad',
    'id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('torneos')
      .select(columns)
      .eq('id', torneoId)
      .single();

    if (!error && data) {
      return { data, error: null };
    }

    lastError = error;
    const isMissingColumn = error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
    if (!isMissingColumn) break;
  }

  return { data: null, error: lastError };
};

const fetchPerfilesCompat = async (playerIds) => {
  const selectOptions = [
    'id, sexo, categoria, categoria_singles, categoria_dobles, ranking_elo, ranking_elo_singles, ranking_elo_dobles',
    'id, sexo, categoria_singles, categoria_dobles, ranking_elo_singles, ranking_elo_dobles',
    'id, sexo, categoria, ranking_elo',
    'id, ranking_elo_singles, ranking_elo_dobles, ranking_elo',
    'id, ranking_elo',
    'id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .in('id', playerIds);

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;
    const isMissingColumn = error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
    if (!isMissingColumn) break;
  }

  return { data: [], error: lastError };
};

const updateRankingField = async (jugadorId, preferredField, value) => {
  const preferredPayload = { [preferredField]: value };
  const { error: preferredError } = await supabase
    .from('perfiles')
    .update(preferredPayload)
    .eq('id', jugadorId);

  if (!preferredError) {
    return { appliedField: preferredField, error: null };
  }

  const isMissingColumn = preferredError.code === '42703' || /column .* does not exist/i.test(preferredError.message || '');
  if (!isMissingColumn) {
    return { appliedField: preferredField, error: preferredError };
  }

  const fallbackPayload = { ranking_elo: value };
  const { error: fallbackError } = await supabase
    .from('perfiles')
    .update(fallbackPayload)
    .eq('id', jugadorId);

  return { appliedField: 'ranking_elo', error: fallbackError || null };
};

const resolveRoundOrder = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const resolveRankingPointsField = (modalidad) => {
  const normalized = normalizeModalidad(modalidad) || 'Singles';
  return RANKING_POINTS_FIELD_BY_MODALIDAD[normalized] || 'ranking_puntos_singles';
};

const toSafeNonNegativeInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const fetchTorneoPuntosCompat = async (torneoId) => {
  const selectOptions = [
    'id, modalidad, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon',
    'id, modalidad',
    'id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('torneos')
      .select(columns)
      .eq('id', torneoId)
      .single();

    if (!error && data) {
      return { data, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { data: null, error: lastError };
};

const resolveRoundPointsFromConfig = (torneoConfig = {}, rondaOrden) => {
  const normalizedRoundOrder = resolveRoundOrder(rondaOrden);
  if (normalizedRoundOrder === null) return 0;

  const field = ROUND_POINTS_FIELD_BY_ORDER[normalizedRoundOrder];
  if (!field) return 0;

  return toSafeNonNegativeInt(torneoConfig?.[field]);
};

const resolveChampionPointsFromConfig = (torneoConfig = {}) => {
  return toSafeNonNegativeInt(
    torneoConfig?.puntos_campeon
    ?? torneoConfig?.puntos_ronda_1
    ?? torneoConfig?.puntos_ronda_2,
  );
};

const resolveTargetPointsByMatchOutcome = ({ torneoConfig = {}, rondaOrden, isWinner }) => {
  const normalizedRoundOrder = resolveRoundOrder(rondaOrden);
  if (normalizedRoundOrder === null) return 0;

  if (!isWinner) {
    return resolveRoundPointsFromConfig(torneoConfig, normalizedRoundOrder);
  }

  if (normalizedRoundOrder === 2) {
    return resolveChampionPointsFromConfig(torneoConfig);
  }

  const nextRoundOrder = normalizedRoundOrder / 2;
  if (!Number.isInteger(nextRoundOrder) || nextRoundOrder < 2) {
    return 0;
  }

  return resolveRoundPointsFromConfig(torneoConfig, nextRoundOrder);
};

const fetchTournamentAwardsCompat = async (torneoId) => {
  const selectOptions = [
    'id, estado, ranking_puntos_otorgados, ranking_puntos_jugador_id, ranking_puntos_modalidad, ranking_puntos_perdedor_otorgados, ranking_puntos_perdedor_jugador_id, ranking_puntos_perdedor_modalidad',
    'id, estado, ranking_puntos_otorgados, ranking_puntos_jugador_id, ranking_puntos_modalidad',
    'id, ranking_puntos_otorgados, ranking_puntos_jugador_id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const hasEstado = columns.includes('estado');
    let query = supabase
      .from('partidos')
      .select(columns)
      .eq('torneo_id', torneoId);

    if (hasEstado) {
      query = query.eq('estado', 'finalizado');
    }

    const { data, error } = await query;

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { data: [], error: lastError };
};

const resolvePlayerAwardedPointsFromMatches = (matches, jugadorId) => {
  if (!jugadorId) return 0;

  let maxPoints = 0;
  for (const match of matches || []) {
    if (sameEntityId(match?.ranking_puntos_jugador_id, jugadorId)) {
      maxPoints = Math.max(maxPoints, toSafeNonNegativeInt(match?.ranking_puntos_otorgados));
    }

    if (sameEntityId(match?.ranking_puntos_perdedor_jugador_id, jugadorId)) {
      maxPoints = Math.max(maxPoints, toSafeNonNegativeInt(match?.ranking_puntos_perdedor_otorgados));
    }
  }

  return maxPoints;
};

const fetchPerfilPuntosCompat = async (jugadorId) => {
  const selectOptions = [
    'id, ranking_puntos, ranking_puntos_singles, ranking_puntos_dobles',
    'id, ranking_puntos',
    'id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .eq('id', jugadorId)
      .single();

    if (!error && data) {
      return { data, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { data: null, error: lastError };
};

const updateRankingPointsField = async (jugadorId, preferredField, value) => {
  const normalizedValue = toSafeNonNegativeInt(value);

  const preferredPayload = { [preferredField]: normalizedValue };
  const { error: preferredError } = await supabase
    .from('perfiles')
    .update(preferredPayload)
    .eq('id', jugadorId);

  if (!preferredError) {
    return { appliedField: preferredField, error: null };
  }

  if (!isMissingColumnError(preferredError)) {
    return { appliedField: preferredField, error: preferredError };
  }

  const fallbackPayload = { ranking_puntos: normalizedValue };
  const { error: fallbackError } = await supabase
    .from('perfiles')
    .update(fallbackPayload)
    .eq('id', jugadorId);

  if (!fallbackError) {
    return { appliedField: 'ranking_puntos', error: null };
  }

  if (isMissingColumnError(fallbackError)) {
    return {
      appliedField: preferredField,
      error: { message: 'No hay columnas de ranking por puntos en perfiles.' },
    };
  }

  return { appliedField: 'ranking_puntos', error: fallbackError };
};

const applyPlayerPointsDelta = async ({ jugadorId, modalidad, delta }) => {
  if (!jugadorId || !delta) {
    return { applied: false, reason: 'delta_vacio' };
  }

  const { data: perfil, error: perfilError } = await fetchPerfilPuntosCompat(jugadorId);
  if (perfilError || !perfil) {
    return { applied: false, reason: 'perfil_no_disponible', error: perfilError };
  }

  const preferredField = resolveRankingPointsField(modalidad);
  const currentRaw = Number(
    perfil?.[preferredField]
    ?? perfil?.ranking_puntos
    ?? 0,
  );
  const current = Number.isFinite(currentRaw) ? currentRaw : 0;
  const next = Math.max(0, Math.round(current + delta));

  const updateResult = await updateRankingPointsField(jugadorId, preferredField, next);
  if (updateResult.error) {
    return { applied: false, reason: 'error_actualizando_puntos', error: updateResult.error };
  }

  return {
    applied: true,
    jugador_id: jugadorId,
    modalidad: normalizeModalidad(modalidad) || 'Singles',
    before: current,
    after: next,
    delta,
    ranking_field: updateResult.appliedField,
  };
};

const aplicarPuntosRankingPorRonda = async ({ partidoAntes, partidoDespues, ganador_id, torneoConfig }) => {
  try {
    const torneoId = partidoDespues?.torneo_id || partidoAntes?.torneo_id;
    const partidoId = partidoDespues?.id || partidoAntes?.id;
    const jugador1Id = partidoDespues?.jugador1_id ?? partidoAntes?.jugador1_id ?? null;
    const jugador2Id = partidoDespues?.jugador2_id ?? partidoAntes?.jugador2_id ?? null;
    const perdedorId = sameEntityId(jugador1Id, ganador_id)
      ? jugador2Id
      : (sameEntityId(jugador2Id, ganador_id) ? jugador1Id : null);

    if (!torneoId || !partidoId || !ganador_id) {
      return { applied: false, reason: 'datos_incompletos' };
    }

    let resolvedTorneoConfig = torneoConfig || null;
    if (!resolvedTorneoConfig) {
      const { data: fetchedTorneoConfig, error: torneoError } = await fetchTorneoPuntosCompat(torneoId);
      if (torneoError || !fetchedTorneoConfig) {
        return { applied: false, reason: 'torneo_no_disponible', error: torneoError };
      }
      resolvedTorneoConfig = fetchedTorneoConfig;
    }

    const modalidad = normalizeModalidad(resolvedTorneoConfig.modalidad) || 'Singles';
    const rondaOrden = resolveRoundOrder(partidoDespues?.ronda_orden ?? partidoAntes?.ronda_orden);
    const puntosObjetivoGanador = resolveTargetPointsByMatchOutcome({
      torneoConfig: resolvedTorneoConfig,
      rondaOrden,
      isWinner: true,
    });
    const puntosObjetivoPerdedor = resolveTargetPointsByMatchOutcome({
      torneoConfig: resolvedTorneoConfig,
      rondaOrden,
      isWinner: false,
    });

    const puntosPreviosGanador = toSafeNonNegativeInt(partidoAntes?.ranking_puntos_otorgados);
    const jugadorPrevioGanador = String(partidoAntes?.ranking_puntos_jugador_id || '').trim();
    const puntosPreviosPerdedor = toSafeNonNegativeInt(partidoAntes?.ranking_puntos_perdedor_otorgados);
    const jugadorPrevioPerdedor = String(partidoAntes?.ranking_puntos_perdedor_jugador_id || '').trim();
    const hasPreviousAwardMetadata = (
      puntosPreviosGanador > 0
      || Boolean(jugadorPrevioGanador)
      || puntosPreviosPerdedor > 0
      || Boolean(jugadorPrevioPerdedor)
    );

    if (puntosObjetivoGanador <= 0 && puntosObjetivoPerdedor <= 0 && !hasPreviousAwardMetadata) {
      return {
        applied: false,
        reason: 'sin_puntos_configurados_para_ronda',
        ronda_orden: rondaOrden,
        modalidad,
      };
    }

    const { data: awardMatches, error: awardsError } = await fetchTournamentAwardsCompat(torneoId);
    if (awardsError) {
      return { applied: false, reason: 'error_leyendo_awards_torneo', error: awardsError };
    }

    const puntosActualesGanador = resolvePlayerAwardedPointsFromMatches(awardMatches, ganador_id);
    const puntosActualesPerdedor = resolvePlayerAwardedPointsFromMatches(awardMatches, perdedorId);
    const deltaGanador = puntosObjetivoGanador - puntosActualesGanador;
    const deltaPerdedor = puntosObjetivoPerdedor - puntosActualesPerdedor;

    let updateGanador = {
      applied: false,
      jugador_id: ganador_id,
      before: puntosActualesGanador,
      target: puntosObjetivoGanador,
      delta: deltaGanador,
    };

    if (ganador_id && deltaGanador !== 0) {
      const winnerDeltaResult = await applyPlayerPointsDelta({
        jugadorId: ganador_id,
        modalidad,
        delta: deltaGanador,
      });

      if (winnerDeltaResult.error) {
        return { applied: false, reason: 'error_otorgando_puntos_ganador', error: winnerDeltaResult.error };
      }

      updateGanador = winnerDeltaResult;
      updateGanador.target = puntosObjetivoGanador;
    }

    let updatePerdedor = {
      applied: false,
      jugador_id: perdedorId,
      before: puntosActualesPerdedor,
      target: puntosObjetivoPerdedor,
      delta: deltaPerdedor,
    };

    if (perdedorId && deltaPerdedor !== 0) {
      const loserDeltaResult = await applyPlayerPointsDelta({
        jugadorId: perdedorId,
        modalidad,
        delta: deltaPerdedor,
      });

      if (loserDeltaResult.error) {
        return { applied: false, reason: 'error_otorgando_puntos_perdedor', error: loserDeltaResult.error };
      }

      updatePerdedor = loserDeltaResult;
      updatePerdedor.target = puntosObjetivoPerdedor;
    }

    const metadataPayload = {
      ranking_puntos_otorgados: puntosObjetivoGanador,
      ranking_puntos_jugador_id: puntosObjetivoGanador > 0 ? ganador_id : null,
      ranking_puntos_modalidad: puntosObjetivoGanador > 0 ? modalidad : null,
      ranking_puntos_perdedor_otorgados: puntosObjetivoPerdedor,
      ranking_puntos_perdedor_jugador_id: puntosObjetivoPerdedor > 0 ? perdedorId : null,
      ranking_puntos_perdedor_modalidad: puntosObjetivoPerdedor > 0 ? modalidad : null,
    };

    const metadataUpdate = await updatePartidoCompat(partidoId, metadataPayload);
    if (metadataUpdate.error && !isMissingColumnError(metadataUpdate.error) && !isNoCompatiblePayloadError(metadataUpdate.error)) {
      return { applied: false, reason: 'error_guardando_metadata_puntos', error: metadataUpdate.error };
    }

    return {
      applied: Boolean(updateGanador.applied || updatePerdedor.applied),
      modalidad,
      ronda_orden: rondaOrden,
      ganador: {
        jugador_id: ganador_id,
        puntos_objetivo: puntosObjetivoGanador,
        puntos_previos_torneo: puntosActualesGanador,
        delta_aplicado: deltaGanador,
        update: updateGanador,
      },
      perdedor: {
        jugador_id: perdedorId,
        puntos_objetivo: puntosObjetivoPerdedor,
        puntos_previos_torneo: puntosActualesPerdedor,
        delta_aplicado: deltaPerdedor,
        update: updatePerdedor,
      },
    };
  } catch (err) {
    return { applied: false, reason: 'points_exception', error: err };
  }
};

const aplicarImpactoRanking = async ({ partidoActual, ganador_id }) => {
  try {
    const jugador1 = partidoActual.jugador1_id;
    const jugador2 = partidoActual.jugador2_id;

    if (!jugador1 || !jugador2) {
      return { applied: false, reason: 'partido_sin_dos_jugadores' };
    }

    const perdedor_id = jugador1 === ganador_id ? jugador2 : jugador1;

    const { data: torneo, error: torneoError } = await fetchTorneoCompetitivo(partidoActual.torneo_id);
    if (torneoError || !torneo) {
      return { applied: false, reason: 'torneo_no_disponible', error: torneoError };
    }

    const modalidad = normalizeModalidad(torneo.modalidad) || 'Singles';
    const rama = normalizeRama(torneo.rama);
    const categoriaId = parseCategoria(torneo.categoria_id);
    const rankingField = modalidad === 'Dobles' ? 'ranking_elo_dobles' : 'ranking_elo_singles';

    const { data: perfiles, error: perfilesError } = await fetchPerfilesCompat([ganador_id, perdedor_id]);
    if (perfilesError) {
      return { applied: false, reason: 'perfiles_no_disponibles', error: perfilesError };
    }

    const perfilById = new Map((perfiles || []).map((p) => [p.id, p]));
    const perfilGanador = perfilById.get(ganador_id);
    const perfilPerdedor = perfilById.get(perdedor_id);

    if (!perfilGanador || !perfilPerdedor) {
      return { applied: false, reason: 'perfiles_incompletos' };
    }

    if (rama && rama !== 'Mixto') {
      const sexoGanador = normalizeRama(perfilGanador.sexo);
      const sexoPerdedor = normalizeRama(perfilPerdedor.sexo);
      if (sexoGanador !== rama || sexoPerdedor !== rama) {
        return { applied: false, reason: 'sexo_no_coincide_torneo' };
      }
    }

    if (categoriaId !== null) {
      const categoriaGanador = resolveCategoriaPerfil(perfilGanador, modalidad);
      const categoriaPerdedor = resolveCategoriaPerfil(perfilPerdedor, modalidad);
      if (categoriaGanador !== categoriaId || categoriaPerdedor !== categoriaId) {
        return { applied: false, reason: 'categoria_no_coincide_torneo' };
      }
    }

    const winnerCurrent = Number(perfilGanador[rankingField] ?? perfilGanador.ranking_elo ?? 1200);
    const loserCurrent = Number(perfilPerdedor[rankingField] ?? perfilPerdedor.ranking_elo ?? 1200);

    const winnerNext = nextElo(winnerCurrent, loserCurrent, 1);
    const loserNext = nextElo(loserCurrent, winnerCurrent, 0);

    const winnerUpdate = await updateRankingField(ganador_id, rankingField, winnerNext);
    if (winnerUpdate.error) {
      return { applied: false, reason: 'error_actualizando_ganador', error: winnerUpdate.error };
    }

    const loserUpdate = await updateRankingField(perdedor_id, rankingField, loserNext);
    if (loserUpdate.error) {
      return { applied: false, reason: 'error_actualizando_perdedor', error: loserUpdate.error };
    }

    return {
      applied: true,
      modalidad,
      rama: rama || null,
      categoria_id: categoriaId,
      torneo_config: torneo,
      ranking_field_ganador: winnerUpdate.appliedField,
      ranking_field_perdedor: loserUpdate.appliedField,
      ganador: { id: ganador_id, before: winnerCurrent, after: winnerNext },
      perdedor: { id: perdedor_id, before: loserCurrent, after: loserNext },
    };
  } catch (err) {
    return { applied: false, reason: 'ranking_exception', error: err };
  }
};

const parseFechaHora = (body = {}) => {
  const directValue = body.fecha_hora ?? body.fechaHora ?? body.horario ?? body.programacion?.fecha_hora ?? body.programacion?.fechaHora;

  if (directValue) {
    const parsed = new Date(directValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (body.fecha && body.hora) {
    const parsed = new Date(`${String(body.fecha).trim()}T${String(body.hora).trim()}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
};

const parseCanchaId = (body = {}) => {
  const canchaId = body.cancha_id ?? body.canchaId ?? body.programacion?.cancha_id ?? body.programacion?.canchaId;
  if (canchaId == null || canchaId === '') return null;
  return String(canchaId).trim();
};

const isMissingColumnError = (error) => {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
};

const parseMarcadorEnVivo = (body = {}) => {
  const input = body.marcador_en_vivo ?? body.marcador;

  if (input === undefined || input === null) {
    return null;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  if (typeof input === 'object') {
    return input;
  }

  return String(input);
};

const normalizeEstadoPartido = (value) => {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  const aliasMap = {
    iniciar: 'en_juego',
    empezado: 'en_juego',
    started: 'en_juego',
    in_progress: 'en_juego',
    'en curso': 'en_juego',
    en_curso: 'en_juego',
    finalizado: 'finalizado',
    finalizada: 'finalizado',
    terminado: 'finalizado',
    terminada: 'finalizado',
    finished: 'finalizado',
    complete: 'finalizado',
    completed: 'finalizado',
    programado: 'programado',
    programada: 'programado',
    scheduled: 'programado',
  };

  return aliasMap[normalized] || normalized;
};

const emitRealtime = (eventName, payload) => {
  const io = global.__tennisflow_io;
  if (io && typeof io.emit === 'function') {
    io.emit(eventName, payload);
  }
};

const parseMissingColumnName = (error) => {
  const message = error?.message || '';
  const match = /column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of\s+relation\s+"?[a-zA-Z0-9_]+"?\s+)?does not exist/i.exec(message);
  return match ? match[1] : null;
};

const scoreToString = (scoreValue) => {
  if (scoreValue === undefined) return undefined;
  if (scoreValue === null) return null;
  if (typeof scoreValue === 'string') return scoreValue;
  try {
    return JSON.stringify(scoreValue);
  } catch {
    return String(scoreValue);
  }
};

const buildMarcadorFallback = ({ ganadorId, hasScore, score, hasResultado, resultado }) => {
  if (!hasScore && !hasResultado) {
    return undefined;
  }

  const fallback = {};

  if (hasScore && score !== undefined) {
    fallback.score = score;
  }

  if (hasResultado && resultado !== undefined) {
    fallback.resultado = resultado;
  }

  if (ganadorId) {
    fallback.ganador_id = ganadorId;
  }

  if (Object.keys(fallback).length === 0) {
    return undefined;
  }

  fallback.estado = 'finalizado';
  return fallback;
};

const buildResultadoPayload = (body = {}) => {
  const nestedGanador = body.resultado && typeof body.resultado === 'object'
    ? (body.resultado.ganador_id ?? body.resultado.ganadorId ?? body.resultado.winner_id ?? null)
    : null;

  const marcadorGanador = body.marcador_en_vivo && typeof body.marcador_en_vivo === 'object'
    ? (body.marcador_en_vivo.ganador_id ?? body.marcador_en_vivo.ganadorId ?? body.marcador_en_vivo.winner_id ?? null)
    : null;

  const ganadorId = body.ganador_id ?? body.ganadorId ?? body.winner_id ?? nestedGanador ?? marcadorGanador ?? null;
  const hasScore = Object.prototype.hasOwnProperty.call(body, 'score');
  const hasResultado = Object.prototype.hasOwnProperty.call(body, 'resultado');
  const explicitMarcador = Object.prototype.hasOwnProperty.call(body, 'marcador_en_vivo')
    || Object.prototype.hasOwnProperty.call(body, 'marcador');

  const score = scoreToString(body.score);
  const resultado = hasResultado ? body.resultado : undefined;
  const parsedMarcador = explicitMarcador ? parseMarcadorEnVivo(body) : undefined;
  const fallbackMarcador = buildMarcadorFallback({
    ganadorId,
    hasScore,
    score,
    hasResultado,
    resultado,
  });
  const marcador = parsedMarcador ?? fallbackMarcador;
  const hasMarcador = marcador !== undefined;

  return {
    ganadorId,
    hasScore,
    score,
    hasResultado,
    resultado,
    hasMarcador,
    marcador,
  };
};

const normalizeWinnerSide = (value) => {
  if (value === undefined || value === null) return null;

  if (typeof value === 'number') {
    if (value === 1) return 1;
    if (value === 2) return 2;
    return null;
  }

  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const side1 = new Set(['1', 'j1', 'jugador1', 'player1', 'p1', 'local', 'home', 'a', 'izquierda', 'left']);
  const side2 = new Set(['2', 'j2', 'jugador2', 'player2', 'p2', 'visitante', 'away', 'b', 'derecha', 'right']);

  if (side1.has(normalized)) return 1;
  if (side2.has(normalized)) return 2;
  return null;
};

const inferGanadorIdFromCompatPayload = (body = {}, partidoActual = {}) => {
  const sources = [
    body.ganador,
    body.winner,
    body.ganador_side,
    body.winner_side,
    body.ganadorSlot,
    body.winnerSlot,
    body.ganador_posicion,
    body.winner_position,
    body.resultado?.ganador,
    body.resultado?.winner,
    body.resultado?.ganador_side,
    body.resultado?.winner_side,
    body.marcador_en_vivo?.ganador,
    body.marcador_en_vivo?.winner,
    body.marcador_en_vivo?.ganador_side,
    body.marcador_en_vivo?.winner_side,
    body.marcador?.ganador,
    body.marcador?.winner,
    body.marcador?.ganador_side,
    body.marcador?.winner_side,
  ];

  for (const value of sources) {
    if (value === undefined || value === null || value === '') continue;

    if (typeof value === 'string' && UUID_REGEX.test(value.trim())) {
      return value.trim();
    }

    if (typeof value === 'object') {
      const nestedId = value.id ?? value.ganador_id ?? value.ganadorId ?? value.winner_id;
      if (typeof nestedId === 'string' && UUID_REGEX.test(nestedId.trim())) {
        return nestedId.trim();
      }
    }

    const side = normalizeWinnerSide(value);
    if (side === 1 && partidoActual.jugador1_id) return partidoActual.jugador1_id;
    if (side === 2 && partidoActual.jugador2_id) return partidoActual.jugador2_id;
  }

  return null;
};

const parseSetPair = (setValue) => {
  if (!setValue) return null;

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  if (Array.isArray(setValue) && setValue.length >= 2) {
    const a = toNum(setValue[0]);
    const b = toNum(setValue[1]);
    if (a !== null && b !== null) return [a, b];
  }

  if (typeof setValue === 'object') {
    const a = toNum(setValue.j1 ?? setValue.jugador1 ?? setValue.player1 ?? setValue.local ?? setValue.a);
    const b = toNum(setValue.j2 ?? setValue.jugador2 ?? setValue.player2 ?? setValue.visitante ?? setValue.b);
    if (a !== null && b !== null) return [a, b];
  }

  return null;
};

const extractSetPairsFromScoreText = (scoreText) => {
  if (typeof scoreText !== 'string') return [];
  const matches = [...scoreText.matchAll(/(\d{1,2})\s*[-:]\s*(\d{1,2})/g)];
  return matches
    .map((m) => [Number(m[1]), Number(m[2])])
    .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
};

const inferGanadorIdFromScoreData = ({ body = {}, parsedPayload = {}, partidoActual = {} }) => {
  const setsSources = [
    body.resultado?.sets,
    body.marcador_en_vivo?.sets,
    body.marcador?.sets,
    parsedPayload.resultado?.sets,
    parsedPayload.marcador?.sets,
  ];

  let setPairs = [];
  for (const source of setsSources) {
    if (!Array.isArray(source)) continue;
    setPairs = source.map((s) => parseSetPair(s)).filter(Boolean);
    if (setPairs.length > 0) break;
  }

  if (setPairs.length === 0 && typeof parsedPayload.score === 'string') {
    setPairs = extractSetPairsFromScoreText(parsedPayload.score);
  }

  if (setPairs.length === 0) return null;

  let j1Sets = 0;
  let j2Sets = 0;
  for (const [a, b] of setPairs) {
    if (a > b) j1Sets += 1;
    else if (b > a) j2Sets += 1;
  }

  if (j1Sets === j2Sets) return null;
  if (j1Sets > j2Sets) return partidoActual.jugador1_id || null;
  return partidoActual.jugador2_id || null;
};

const fetchPartidoCompat = async (partidoId) => {
  const selectOptions = [
    'id, torneo_id, ronda, ronda_orden, orden_en_ronda, estado, jugador1_id, jugador2_id, jugador1_origen_partido_id, jugador2_origen_partido_id, ganador_id, score, resultado, marcador_en_vivo, ultima_actualizacion, ranking_puntos_otorgados, ranking_puntos_jugador_id, ranking_puntos_modalidad, ranking_puntos_perdedor_otorgados, ranking_puntos_perdedor_jugador_id, ranking_puntos_perdedor_modalidad',
    'id, torneo_id, ronda, ronda_orden, orden_en_ronda, estado, jugador1_id, jugador2_id, jugador1_origen_partido_id, jugador2_origen_partido_id, ganador_id, marcador_en_vivo, ultima_actualizacion, ranking_puntos_otorgados, ranking_puntos_jugador_id, ranking_puntos_perdedor_otorgados, ranking_puntos_perdedor_jugador_id',
    'id, torneo_id, ronda, ronda_orden, estado, jugador1_id, jugador2_id, ganador_id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('partidos')
      .select(columns)
      .eq('id', partidoId)
      .single();

    if (!error && data) {
      return { data, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      break;
    }
  }

  return { data: null, error: lastError };
};

const hydratePartidoPlayersFromOrigin = async (partidoActual) => {
  if (!partidoActual?.id) {
    return { partido: partidoActual, error: null };
  }

  let jugador1Id = partidoActual.jugador1_id || null;
  let jugador2Id = partidoActual.jugador2_id || null;

  if (!jugador1Id && partidoActual.jugador1_origen_partido_id) {
    const originLeft = await fetchPartidoCompat(partidoActual.jugador1_origen_partido_id);
    if (originLeft.error) {
      return { partido: partidoActual, error: originLeft.error };
    }
    if (originLeft.data?.ganador_id) {
      jugador1Id = originLeft.data.ganador_id;
    }
  }

  if (!jugador2Id && partidoActual.jugador2_origen_partido_id) {
    const originRight = await fetchPartidoCompat(partidoActual.jugador2_origen_partido_id);
    if (originRight.error) {
      return { partido: partidoActual, error: originRight.error };
    }
    if (originRight.data?.ganador_id) {
      jugador2Id = originRight.data.ganador_id;
    }
  }

  const updatePayload = {};
  if (!partidoActual.jugador1_id && jugador1Id) updatePayload.jugador1_id = jugador1Id;
  if (!partidoActual.jugador2_id && jugador2Id) updatePayload.jugador2_id = jugador2Id;

  if (Object.keys(updatePayload).length > 0) {
    const updateHydrated = await updatePartidoCompat(partidoActual.id, updatePayload);
    if (!updateHydrated.error && updateHydrated.data) {
      return { partido: updateHydrated.data, error: null };
    }

    return {
      partido: {
        ...partidoActual,
        ...updatePayload,
      },
      error: updateHydrated.error || null,
    };
  }

  return {
    partido: {
      ...partidoActual,
      jugador1_id: jugador1Id,
      jugador2_id: jugador2Id,
    },
    error: null,
  };
};

const hydratePartidoPlayersFromBracketContext = async (partidoActual) => {
  if (!partidoActual?.id || !partidoActual?.torneo_id) {
    return { partido: partidoActual, error: null };
  }

  const rondaOrdenActual = Number.parseInt(String(partidoActual.ronda_orden ?? ''), 10);
  if (!Number.isInteger(rondaOrdenActual) || rondaOrdenActual <= 1) {
    return { partido: partidoActual, error: null };
  }

  const currentRoundResult = await fetchRoundMatchesCompat(partidoActual.torneo_id, rondaOrdenActual);
  if (currentRoundResult.error) {
    return { partido: partidoActual, error: currentRoundResult.error };
  }

  const currentRound = [...currentRoundResult.data].sort(compareRoundMatches);
  const partidoActualId = normalizeEntityId(partidoActual.id);
  let currentIndex = currentRound.findIndex((p) => normalizeEntityId(p.id) === partidoActualId);

  if (currentIndex < 0) {
    const indexFromOrder = deriveRoundIndexFromOrder(partidoActual.orden_en_ronda);
    if (indexFromOrder !== null) {
      currentIndex = indexFromOrder;
    }
  }

  if (currentIndex < 0) {
    return { partido: partidoActual, error: null };
  }

  const previousRondaOrden = rondaOrdenActual * 2;
  const previousRoundResult = await fetchRoundMatchesCompat(partidoActual.torneo_id, previousRondaOrden);
  if (previousRoundResult.error) {
    return { partido: partidoActual, error: previousRoundResult.error };
  }

  const previousRound = [...previousRoundResult.data].sort(compareRoundMatches);
  const sourceLeft = previousRound[currentIndex * 2] || null;
  const sourceRight = previousRound[currentIndex * 2 + 1] || null;

  const inferredJugador1 = sourceLeft?.ganador_id || null;
  const inferredJugador2 = sourceRight?.ganador_id || null;

  const updatePayload = {};
  if (!partidoActual.jugador1_id && inferredJugador1) updatePayload.jugador1_id = inferredJugador1;
  if (!partidoActual.jugador2_id && inferredJugador2) updatePayload.jugador2_id = inferredJugador2;

  if (Object.keys(updatePayload).length > 0) {
    const updateHydrated = await updatePartidoCompat(partidoActual.id, updatePayload);
    if (!updateHydrated.error && updateHydrated.data) {
      return { partido: updateHydrated.data, error: null };
    }

    return {
      partido: {
        ...partidoActual,
        ...updatePayload,
      },
      error: updateHydrated.error || null,
    };
  }

  return {
    partido: {
      ...partidoActual,
      jugador1_id: partidoActual.jugador1_id || inferredJugador1,
      jugador2_id: partidoActual.jugador2_id || inferredJugador2,
    },
    error: null,
  };
};

const updatePartidoCompat = async (partidoId, payload) => {
  const mutablePayload = { ...payload };
  const optionalColumns = new Set([
    'score',
    'resultado',
    'marcador_en_vivo',
    'ultima_actualizacion',
    'jugador1_origen_partido_id',
    'jugador2_origen_partido_id',
    'orden_en_ronda',
    'ranking_puntos_otorgados',
    'ranking_puntos_jugador_id',
    'ranking_puntos_modalidad',
    'ranking_puntos_perdedor_otorgados',
    'ranking_puntos_perdedor_jugador_id',
    'ranking_puntos_perdedor_modalidad',
  ]);

  while (Object.keys(mutablePayload).length > 0) {
    const { data, error } = await supabase
      .from('partidos')
      .update(mutablePayload)
      .eq('id', partidoId)
      .select('*')
      .single();

    if (!error) {
      return { data, error: null, appliedPayload: { ...mutablePayload } };
    }

    if (!isMissingColumnError(error)) {
      const optionalKeyToDropOnTypeError = Object.keys(mutablePayload).find((key) => optionalColumns.has(key));
      const isTypeOrCastingError = ['22P02', '42804', '22007', '22023'].includes(error?.code)
        || /invalid input syntax|is of type .* but expression is of type|cannot cast|malformed/i.test(error?.message || '');

      if (isTypeOrCastingError && optionalKeyToDropOnTypeError) {
        delete mutablePayload[optionalKeyToDropOnTypeError];
        continue;
      }

      return { data: null, error };
    }

    const missingColumn = parseMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(mutablePayload, missingColumn)) {
      delete mutablePayload[missingColumn];
      continue;
    }

    const optionalKeyToDrop = Object.keys(mutablePayload).find((key) => optionalColumns.has(key));
    if (!optionalKeyToDrop) {
      return { data: null, error };
    }

    delete mutablePayload[optionalKeyToDrop];
  }

  return {
    data: null,
    error: { message: 'No se pudo actualizar partido: no quedaron columnas compatibles.' },
  };
};

const isNoCompatiblePayloadError = (error) => {
  const message = (error?.message || '').toLowerCase();
  return message.includes('no quedaron columnas compatibles');
};

const fetchRoundMatchesCompat = async (torneoId, rondaOrden) => {
  const selectOptions = [
    'id, torneo_id, ronda_orden, orden_en_ronda, estado, jugador1_id, jugador2_id, ganador_id, jugador1_origen_partido_id, jugador2_origen_partido_id, fecha_hora, cancha_id',
    'id, torneo_id, ronda_orden, orden_en_ronda, estado, jugador1_id, jugador2_id, ganador_id, fecha_hora, cancha_id',
    'id, torneo_id, ronda_orden, estado, jugador1_id, jugador2_id, ganador_id, fecha_hora, cancha_id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('partidos')
      .select(columns)
      .eq('torneo_id', torneoId)
      .eq('ronda_orden', rondaOrden);

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      break;
    }
  }

  return { data: [], error: lastError };
};

const parseOrdenEnRonda = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
};

const compareRoundMatches = (a, b) => {
  const ao = parseOrdenEnRonda(a.orden_en_ronda);
  const bo = parseOrdenEnRonda(b.orden_en_ronda);
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

const normalizeEntityId = (value) => String(value || '').trim().toLowerCase();

const sameEntityId = (a, b) => {
  const left = normalizeEntityId(a);
  const right = normalizeEntityId(b);
  if (!left || !right) return false;
  return left === right;
};

const deriveRoundIndexFromOrder = (ordenEnRonda) => {
  const parsed = Number.parseInt(String(ordenEnRonda ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  if (parsed === 0) return 0;
  return parsed - 1;
};

const getRoundLabel = (rondaOrden) => {
  if (rondaOrden === 2) return 'Final';
  if (rondaOrden === 4) return 'Semifinal';
  if (rondaOrden === 8) return 'Cuartos de Final';
  if (rondaOrden === 16) return 'Octavos de Final';
  if (rondaOrden === 32) return 'Primera Ronda';
  return `Ronda de ${rondaOrden}`;
};

const ensureNextRoundMatch = async (torneoId, nextRondaOrden, targetIndex) => {
  let currentRound = [];

  for (let guard = 0; guard < 16; guard += 1) {
    const fetched = await fetchRoundMatchesCompat(torneoId, nextRondaOrden);
    if (fetched.error) return fetched;

    currentRound = [...fetched.data].sort(compareRoundMatches);
    if (currentRound.length > targetIndex) {
      return { data: currentRound, error: null };
    }

    const placeholderPayload = {
      torneo_id: torneoId,
      ronda: getRoundLabel(nextRondaOrden),
      ronda_orden: nextRondaOrden,
      estado: 'programado',
      orden_en_ronda: currentRound.length + 1,
    };

    const { error: insertError } = await supabase
      .from('partidos')
      .insert(placeholderPayload);

    if (insertError && !isMissingColumnError(insertError)) {
      return { data: [], error: insertError };
    }

    if (insertError && isMissingColumnError(insertError)) {
      const fallbackPayload = {
        torneo_id: torneoId,
        ronda: getRoundLabel(nextRondaOrden),
        ronda_orden: nextRondaOrden,
        estado: 'programado',
      };
      const { error: fallbackInsertError } = await supabase
        .from('partidos')
        .insert(fallbackPayload);
      if (fallbackInsertError) {
        return { data: [], error: fallbackInsertError };
      }
    }
  }

  return {
    data: currentRound,
    error: { message: 'No fue posible asegurar el partido de la siguiente ronda.' },
  };
};

const rollbackResultadoPartido = async (partidoOriginal) => {
  const rollbackPayload = {
    ganador_id: partidoOriginal.ganador_id ?? null,
    estado: partidoOriginal.estado ?? 'programado',
    score: partidoOriginal.score ?? null,
    resultado: partidoOriginal.resultado ?? null,
    marcador_en_vivo: partidoOriginal.marcador_en_vivo ?? null,
    ultima_actualizacion: partidoOriginal.ultima_actualizacion ?? null,
  };

  await updatePartidoCompat(partidoOriginal.id, rollbackPayload);
};

const propagarGanadorSiguienteRonda = async ({ partidoActual, ganadorId }) => {
  if (partidoActual.ronda_orden <= 2) {
    const { error: torneoUpdateError } = await supabase
      .from('torneos')
      .update({ estado: 'finalizado' })
      .eq('id', partidoActual.torneo_id);

    return {
      siguientePartido: null,
      torneoFinalizado: !torneoUpdateError,
      error: torneoUpdateError || null,
    };
  }

  const nextRondaOrden = partidoActual.ronda_orden / 2;

  const currentRoundResult = await fetchRoundMatchesCompat(partidoActual.torneo_id, partidoActual.ronda_orden);
  if (currentRoundResult.error) {
    return { siguientePartido: null, torneoFinalizado: false, error: currentRoundResult.error };
  }

  const currentRound = [...currentRoundResult.data].sort(compareRoundMatches);
  const partidoActualId = normalizeEntityId(partidoActual.id);
  let currentIndex = currentRound.findIndex((p) => normalizeEntityId(p.id) === partidoActualId);

  if (currentIndex < 0) {
    const indexFromOrder = deriveRoundIndexFromOrder(partidoActual.orden_en_ronda);
    if (indexFromOrder !== null) {
      currentIndex = indexFromOrder;
    }
  }

  if (currentIndex < 0) {
    return {
      siguientePartido: null,
      torneoFinalizado: false,
      error: { message: 'No se pudo ubicar el partido en su ronda para propagar ganador.' },
    };
  }

  const targetIndex = Math.floor(currentIndex / 2);
  const isLeftSlot = currentIndex % 2 === 0;

  const nextRoundResult = await ensureNextRoundMatch(partidoActual.torneo_id, nextRondaOrden, targetIndex);
  if (nextRoundResult.error) {
    return { siguientePartido: null, torneoFinalizado: false, error: nextRoundResult.error };
  }

  const nextRound = [...nextRoundResult.data].sort(compareRoundMatches);
  const targetMatch = nextRound[targetIndex];

  const payload = isLeftSlot
    ? {
      jugador1_id: ganadorId,
      jugador1_origen_partido_id: partidoActual.id,
      estado: targetMatch.estado === 'finalizado' ? targetMatch.estado : 'programado',
    }
    : {
      jugador2_id: ganadorId,
      jugador2_origen_partido_id: partidoActual.id,
      estado: targetMatch.estado === 'finalizado' ? targetMatch.estado : 'programado',
    };

  const updateTarget = await updatePartidoCompat(targetMatch.id, payload);
  if (updateTarget.error) {
    return { siguientePartido: null, torneoFinalizado: false, error: updateTarget.error };
  }

  return {
    siguientePartido: updateTarget.data,
    torneoFinalizado: false,
    error: null,
  };
};

const cargarResultado = async (req, res) => {
  try {
    const { id: partido_id } = req.params;

    if (!UUID_REGEX.test(partido_id)) {
      return res.status(400).json({ error: 'El partido_id es invalido.' });
    }

    const { data: partidoActualRaw, error: errPA } = await fetchPartidoCompat(partido_id);
    if (errPA || !partidoActualRaw) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    let partidoActual = partidoActualRaw;
    const requiresOriginHydration = (!partidoActual.jugador1_id || !partidoActual.jugador2_id)
      && (partidoActual.jugador1_origen_partido_id || partidoActual.jugador2_origen_partido_id);

    if (requiresOriginHydration) {
      const hydrated = await hydratePartidoPlayersFromOrigin(partidoActual);
      if (hydrated.partido) {
        partidoActual = hydrated.partido;
      }
    }

    const stillMissingPlayers = !partidoActual.jugador1_id || !partidoActual.jugador2_id;
    if (stillMissingPlayers) {
      const hydratedFromBracket = await hydratePartidoPlayersFromBracketContext(partidoActual);
      if (hydratedFromBracket.partido) {
        partidoActual = hydratedFromBracket.partido;
      }
    }

    const parsedPayload = buildResultadoPayload(req.body || {});
    const forceWinnerOverride = Boolean(
      req.body?.forzar
      || req.body?.force
      || req.body?.override
      || req.body?.allow_winner_override,
    );
    let ganador_id = parsedPayload.ganadorId;

    if (!ganador_id && partidoActual.ganador_id) {
      ganador_id = partidoActual.ganador_id;
    }

    if (!ganador_id && partidoActual.jugador1_id && !partidoActual.jugador2_id) {
      ganador_id = partidoActual.jugador1_id;
    }

    if (!ganador_id && partidoActual.jugador2_id && !partidoActual.jugador1_id) {
      ganador_id = partidoActual.jugador2_id;
    }

    if (!ganador_id) {
      ganador_id = inferGanadorIdFromCompatPayload(req.body || {}, partidoActual);
    }

    if (!ganador_id) {
      ganador_id = inferGanadorIdFromScoreData({
        body: req.body || {},
        parsedPayload,
        partidoActual,
      });
    }

    if (!ganador_id) {
      return res.status(400).json({
        error: 'En cuadro de eliminacion directa debes enviar ganador_id para finalizar el partido.',
      });
    }

    const existingWinnerBelongsToMatch = sameEntityId(partidoActual.ganador_id, partidoActual.jugador1_id)
      || sameEntityId(partidoActual.ganador_id, partidoActual.jugador2_id);

    if (
      partidoActual.ganador_id
      && partidoActual.estado === 'finalizado'
      && existingWinnerBelongsToMatch
      && !forceWinnerOverride
    ) {
      if (!sameEntityId(partidoActual.ganador_id, ganador_id)) {
        return res.status(409).json({ error: 'El partido ya esta finalizado con otro ganador.' });
      }

      const nowIso = new Date().toISOString();
      const idempotentPayload = {};
      if (parsedPayload.hasScore) idempotentPayload.score = parsedPayload.score;
      if (parsedPayload.hasResultado) idempotentPayload.resultado = parsedPayload.resultado;
      if (parsedPayload.hasMarcador) idempotentPayload.marcador_en_vivo = parsedPayload.marcador;

      let partidoIdempotente = partidoActual;
      if (Object.keys(idempotentPayload).length > 0) {
        idempotentPayload.ultima_actualizacion = nowIso;
        const idempotentUpdate = await updatePartidoCompat(partido_id, idempotentPayload);

        if (idempotentUpdate.error) {
          if (!isMissingColumnError(idempotentUpdate.error) && !isNoCompatiblePayloadError(idempotentUpdate.error)) {
            console.error('Error en finalizacion idempotente de partido:', idempotentUpdate.error);
            return res.status(500).json({ error: 'Error al actualizar datos del resultado.' });
          }
        } else if (idempotentUpdate.data) {
          partidoIdempotente = idempotentUpdate.data;
        }
      }

      emitRealtime('partido_actualizado', {
        partido_id,
        torneo_id: partidoActual.torneo_id,
        estado: 'finalizado',
        ganador_id,
      });

      emitRealtime('cuadro_actualizado', {
        torneo_id: partidoActual.torneo_id,
        partido_actualizado_id: partido_id,
        siguiente_partido_id: null,
      });

      return res.status(200).json({
        message: 'Resultado ya cargado previamente. Se devolvio estado consistente.',
        partido: partidoIdempotente,
        siguiente_partido: null,
        ranking_impact: { applied: false, reason: 'resultado_ya_cargado' },
        ranking_points_impact: { applied: false, reason: 'resultado_ya_cargado' },
      });
    }

    let winnerBelongsToMatch = sameEntityId(partidoActual.jugador1_id, ganador_id)
      || sameEntityId(partidoActual.jugador2_id, ganador_id);

    if (!winnerBelongsToMatch) {
      const hydratedFromBracket = await hydratePartidoPlayersFromBracketContext(partidoActual);
      if (hydratedFromBracket.partido) {
        partidoActual = hydratedFromBracket.partido;
      }

      winnerBelongsToMatch = sameEntityId(partidoActual.jugador1_id, ganador_id)
        || sameEntityId(partidoActual.jugador2_id, ganador_id);
    }

    if (!winnerBelongsToMatch) {
      const repairPayload = {};

      if (!partidoActual.jugador1_id && !partidoActual.jugador2_id) {
        repairPayload.jugador1_id = ganador_id;
      } else if (!partidoActual.jugador1_id) {
        repairPayload.jugador1_id = ganador_id;
      } else if (!partidoActual.jugador2_id) {
        repairPayload.jugador2_id = ganador_id;
      }

      if (Object.keys(repairPayload).length > 0) {
        const repairedMatch = await updatePartidoCompat(partido_id, repairPayload);
        if (!repairedMatch.error) {
          partidoActual = repairedMatch.data || { ...partidoActual, ...repairPayload };
          winnerBelongsToMatch = sameEntityId(partidoActual.jugador1_id, ganador_id)
            || sameEntityId(partidoActual.jugador2_id, ganador_id);
        }
      }
    }

    if (!winnerBelongsToMatch) {
      return res.status(400).json({
        error: 'El ganador no pertenece a este partido',
        debug: {
          partido_id,
          ganador_id_recibido: ganador_id,
          jugador1_id: partidoActual.jugador1_id || null,
          jugador2_id: partidoActual.jugador2_id || null,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const partidoAntesDeFinalizar = { ...partidoActual };
    const updatePayload = {
      ganador_id,
      estado: 'finalizado',
      ultima_actualizacion: nowIso,
    };

    if (parsedPayload.hasScore) updatePayload.score = parsedPayload.score;
    if (parsedPayload.hasResultado) updatePayload.resultado = parsedPayload.resultado;
    if (parsedPayload.hasMarcador) updatePayload.marcador_en_vivo = parsedPayload.marcador;

    let updateCurrent = await updatePartidoCompat(partido_id, updatePayload);
    if (updateCurrent.error) {
      const minimalUpdate = await updatePartidoCompat(partido_id, {
        ganador_id,
        estado: 'finalizado',
      });

      if (!minimalUpdate.error) {
        updateCurrent = minimalUpdate;
      }
    }

    if (updateCurrent.error) {
      const concurrentState = await fetchPartidoCompat(partido_id);
      if (!concurrentState.error && concurrentState.data?.estado === 'finalizado' && concurrentState.data?.ganador_id) {
        return res.status(200).json({
          message: 'Resultado ya persistido en intento concurrente.',
          partido: concurrentState.data,
          siguiente_partido: null,
          ranking_impact: { applied: false, reason: 'resultado_ya_persistido' },
          ranking_points_impact: { applied: false, reason: 'resultado_ya_persistido' },
        });
      }

      console.error('Error actualizando resultado de partido:', updateCurrent.error);
      return res.status(500).json({ error: 'Error al finalizar el partido.' });
    }

    const rankingImpactRaw = await aplicarImpactoRanking({ partidoActual, ganador_id });
    let rankingImpact = rankingImpactRaw;
    if (rankingImpactRaw.error) {
      console.error('Error aplicando impacto de ranking (no bloqueante):', rankingImpactRaw.error);
      rankingImpact = {
        applied: false,
        reason: 'ranking_no_aplicado',
        details: rankingImpactRaw.error?.message || rankingImpactRaw.reason || null,
      };
    }

    const partidoFinalizado = updateCurrent.data || { ...partidoActual, ...updatePayload };
    let rankingPointsImpact = await aplicarPuntosRankingPorRonda({
      partidoAntes: partidoAntesDeFinalizar,
      partidoDespues: partidoFinalizado,
      ganador_id,
      torneoConfig: rankingImpactRaw?.torneo_config || null,
    });

    if (rankingPointsImpact.error) {
      console.error('Error aplicando puntos por ronda (no bloqueante):', rankingPointsImpact.error);
      rankingPointsImpact = {
        applied: false,
        reason: 'puntos_ranking_no_aplicados',
        details: rankingPointsImpact.error?.message || rankingPointsImpact.reason || null,
      };
    }

    let propagation = await propagarGanadorSiguienteRonda({ partidoActual, ganadorId: ganador_id });
    if (propagation.error) {
      console.error('Error propagando ganador (no bloqueante):', propagation.error);
      propagation = {
        siguientePartido: null,
        torneoFinalizado: false,
        error: null,
        warning: propagation.error?.message || 'No se pudo propagar ganador en este intento.',
      };
    }

    emitRealtime('partido_actualizado', {
      partido_id,
      torneo_id: partidoActual.torneo_id,
      estado: 'finalizado',
      ganador_id,
      score: parsedPayload.hasScore ? parsedPayload.score : null,
      resultado: parsedPayload.hasResultado ? parsedPayload.resultado : null,
      marcador_en_vivo: parsedPayload.hasMarcador ? parsedPayload.marcador : null,
    });

    const hasRankingMutation = Boolean(rankingImpact?.applied || rankingPointsImpact?.applied);
    if (hasRankingMutation) {
      emitRealtime('ranking_actualizado', {
        torneo_id: partidoActual.torneo_id,
        partido_id,
        modalidad: rankingPointsImpact?.modalidad || rankingImpact?.modalidad || null,
        ranking_impact: rankingImpact,
        ranking_points_impact: rankingPointsImpact,
        ts: new Date().toISOString(),
      });
    }

    emitRealtime('cuadro_actualizado', {
      torneo_id: partidoActual.torneo_id,
      partido_actualizado_id: partido_id,
      siguiente_partido_id: propagation.siguientePartido?.id || null,
    });

    res.json({
      message: 'Resultado cargado exitosamente. Ganador avanzado de ronda.',
      partido: updateCurrent.data,
      siguiente_partido: propagation.siguientePartido,
      ranking_impact: rankingImpact,
      ranking_points_impact: rankingPointsImpact,
      warnings: propagation.warning ? [propagation.warning] : [],
    });

  } catch (err) {
    try {
      const partidoId = req.params?.id;
      if (partidoId && UUID_REGEX.test(partidoId)) {
        const { data: finalState } = await fetchPartidoCompat(partidoId);
        if (finalState && finalState.estado === 'finalizado' && finalState.ganador_id) {
          return res.status(200).json({
            message: 'Resultado ya persistido en intento concurrente.',
            partido: finalState,
            siguiente_partido: null,
            ranking_impact: { applied: false, reason: 'resultado_ya_persistido' },
            ranking_points_impact: { applied: false, reason: 'resultado_ya_persistido' },
          });
        }
      }
    } catch (fallbackErr) {
      console.error('Error en fallback idempotente de cargarResultado:', fallbackErr);
    }

    console.error('Error al cargar resultado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarProgramacion = async (req, res) => {
  try {
    const { id: partido_id } = req.params;

    if (!UUID_REGEX.test(partido_id)) {
      return res.status(400).json({ error: 'El partido_id es invalido.' });
    }

    const fechaHora = parseFechaHora(req.body || {});
    const canchaId = parseCanchaId(req.body || {});
    const desprogramar = Boolean(req.body?.desprogramar);

    if (!desprogramar && !fechaHora && !canchaId) {
      return res.status(400).json({
        error: 'Debes enviar fecha_hora/horario y/o cancha_id para reprogramar.',
      });
    }

    if (canchaId && !UUID_REGEX.test(canchaId)) {
      return res.status(400).json({ error: 'El cancha_id es invalido.' });
    }

    const { data: partidoActual, error: errFind } = await supabase
      .from('partidos')
      .select('id, estado')
      .eq('id', partido_id)
      .single();

    if (errFind || !partidoActual) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    const payload = desprogramar
      ? { fecha_hora: null, cancha_id: null, estado: 'programado' }
      : {
        fecha_hora: fechaHora ?? null,
        cancha_id: canchaId ?? null,
        estado: partidoActual.estado === 'finalizado' ? partidoActual.estado : 'programado',
      };

    const { data: updated, error: errUpdate } = await supabase
      .from('partidos')
      .update(payload)
      .eq('id', partido_id)
      .select('id, torneo_id, ronda, ronda_orden, jugador1_id, jugador2_id, fecha_hora, cancha_id, estado, notas')
      .single();

    if (errUpdate || !updated) {
      console.error('Error al actualizar programacion de partido:', errUpdate);
      return res.status(500).json({ error: 'Error al actualizar programacion del partido' });
    }

    return res.status(200).json({
      message: desprogramar
        ? 'Partido desprogramado correctamente.'
        : 'Programacion del partido actualizada correctamente.',
      partido: updated,
    });
  } catch (err) {
    console.error('Error inesperado al reprogramar partido:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const empezarPartido = async (req, res) => {
  try {
    const { id: partido_id } = req.params;

    if (!UUID_REGEX.test(partido_id)) {
      return res.status(400).json({ error: 'El partido_id es invalido.' });
    }

    const { data: partidoActual, error: errFind } = await supabase
      .from('partidos')
      .select('id, estado, inicio_real')
      .eq('id', partido_id)
      .single();

    if (errFind || !partidoActual) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    if (partidoActual.estado === 'finalizado') {
      return res.status(409).json({ error: 'No se puede iniciar un partido finalizado.' });
    }

    const nowIso = new Date().toISOString();
    const inicioReal = partidoActual.inicio_real ?? nowIso;

    const { data: updated, error: errUpdate } = await supabase
      .from('partidos')
      .update({
        estado: 'en_juego',
        inicio_real: inicioReal,
        ultima_actualizacion: nowIso,
      })
      .eq('id', partido_id)
      .select('id, torneo_id, estado, inicio_real, ultima_actualizacion, fecha_hora, cancha_id')
      .single();

    if (errUpdate || !updated) {
      if (isMissingColumnError(errUpdate)) {
        return res.status(409).json({
          error: 'La base de datos no tiene columnas para resultados en vivo. Ejecuta migration_v15.sql.',
        });
      }

      console.error('Error al iniciar partido:', errUpdate);
      return res.status(500).json({ error: 'Error al iniciar partido' });
    }

    emitRealtime('partido_actualizado', {
      partido_id,
      torneo_id: updated.torneo_id,
      estado: updated.estado,
      inicio_real: updated.inicio_real,
    });

    return res.status(200).json({
      message: 'Partido iniciado correctamente.',
      partido: updated,
    });
  } catch (err) {
    console.error('Error inesperado al iniciar partido:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarMarcadorEnVivo = async (req, res) => {
  try {
    const { id: partido_id } = req.params;

    if (!UUID_REGEX.test(partido_id)) {
      return res.status(400).json({ error: 'El partido_id es invalido.' });
    }

    const marcadorEnVivo = parseMarcadorEnVivo(req.body || {});

    if (marcadorEnVivo === null) {
      return res.status(400).json({ error: 'Debes enviar marcador_en_vivo (o marcador).' });
    }

    const { data: partidoActual, error: errFind } = await supabase
      .from('partidos')
      .select('id, estado')
      .eq('id', partido_id)
      .single();

    if (errFind || !partidoActual) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    if (partidoActual.estado === 'finalizado') {
      return res.status(409).json({ error: 'No se puede actualizar marcador de un partido finalizado.' });
    }

    const nowIso = new Date().toISOString();

    const { data: updated, error: errUpdate } = await supabase
      .from('partidos')
      .update({
        marcador_en_vivo: marcadorEnVivo,
        ultima_actualizacion: nowIso,
      })
      .eq('id', partido_id)
      .select('id, torneo_id, estado, marcador_en_vivo, ultima_actualizacion, fecha_hora, cancha_id')
      .single();

    if (errUpdate || !updated) {
      if (isMissingColumnError(errUpdate)) {
        return res.status(409).json({
          error: 'La base de datos no tiene columnas para resultados en vivo. Ejecuta migration_v15.sql.',
        });
      }

      console.error('Error al actualizar marcador en vivo:', errUpdate);
      return res.status(500).json({ error: 'Error al actualizar marcador en vivo' });
    }

    emitRealtime('partido_actualizado', {
      partido_id,
      torneo_id: updated.torneo_id,
      estado: updated.estado,
      marcador_en_vivo: updated.marcador_en_vivo,
      ultima_actualizacion: updated.ultima_actualizacion,
    });

    return res.status(200).json({
      message: 'Marcador en vivo actualizado.',
      partido: updated,
    });
  } catch (err) {
    console.error('Error inesperado al actualizar marcador en vivo:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarEstadoPartidoSimple = async (req, res, estadoObjetivo) => {
  try {
    const { id: partido_id } = req.params;

    if (!UUID_REGEX.test(partido_id)) {
      return res.status(400).json({ error: 'El partido_id es invalido.' });
    }

    const { data: partidoActual, error: errFind } = await fetchPartidoCompat(partido_id);
    if (errFind || !partidoActual) {
      return res.status(200).json({
        message: 'Partido no encontrado para cambio de estado. Se ignora por compatibilidad.',
        partido: null,
      });
    }

    if (estadoObjetivo === 'programado' && partidoActual.estado === 'finalizado') {
      return res.status(409).json({ error: 'No se puede volver a programado un partido finalizado.' });
    }

    const nowIso = new Date().toISOString();
    const updatedResult = await updatePartidoCompat(partido_id, {
      estado: estadoObjetivo,
      ultima_actualizacion: nowIso,
    });

    if (updatedResult.error) {
      console.error('Error al actualizar estado simple de partido:', updatedResult.error);
      return res.status(500).json({ error: 'Error al actualizar estado del partido' });
    }

    emitRealtime('partido_actualizado', {
      partido_id,
      torneo_id: updatedResult.data?.torneo_id || partidoActual.torneo_id,
      estado: estadoObjetivo,
      ultima_actualizacion: nowIso,
    });

    return res.status(200).json({
      message: 'Estado del partido actualizado.',
      partido: updatedResult.data,
    });
  } catch (err) {
    console.error('Error inesperado al actualizar estado simple de partido:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarPartidoEnVivo = async (req, res) => {
  const body = req.body || {};
  const estado = normalizeEstadoPartido(
    body.estado
      ?? body.estado_partido
      ?? body.state
      ?? body.status
      ?? body.accion
      ?? body.action,
  );
  const hasMarcador = body.marcador_en_vivo !== undefined || body.marcador !== undefined;
  const hasGanador = body.ganador_id !== undefined
    || body.winner_id !== undefined
    || body.ganadorId !== undefined
    || body.ganador !== undefined
    || body.winner !== undefined;
  const wantsFinalize = Boolean(body.finalizar) || estado === 'finalizado';
  const hasProgramacion = body.fecha_hora !== undefined
    || body.fechaHora !== undefined
    || body.horario !== undefined
    || body.fecha !== undefined
    || body.hora !== undefined
    || body.cancha_id !== undefined
    || body.canchaId !== undefined
    || body.programacion !== undefined
    || body.desprogramar !== undefined;

  if (hasMarcador) {
    return actualizarMarcadorEnVivo(req, res);
  }

  if (estado === 'en_juego') {
    return empezarPartido(req, res);
  }

  if (hasGanador || wantsFinalize) {
    if (!body.ganador_id && (body.winner_id || body.ganadorId)) {
      req.body.ganador_id = body.winner_id || body.ganadorId;
    }

    const hasResultadoData = body.score !== undefined
      || body.resultado !== undefined
      || body.marcador_en_vivo !== undefined
      || body.marcador !== undefined
      || body.ganador !== undefined
      || body.winner !== undefined;

    if (wantsFinalize && !hasResultadoData && !body.ganador_id) {
      const { id: partido_id } = req.params;
      if (!UUID_REGEX.test(partido_id)) {
        return res.status(400).json({ error: 'El partido_id es invalido.' });
      }

      const { data: partidoActual, error: errFind } = await fetchPartidoCompat(partido_id);
      if (errFind || !partidoActual) {
        return res.status(200).json({
          message: 'Solicitud de finalizacion sin ganador ignorada por compatibilidad.',
          partido: null,
        });
      }

      if (partidoActual.estado === 'finalizado' && partidoActual.ganador_id) {
        return res.status(200).json({
          message: 'Resultado ya finalizado previamente. Request de compatibilidad ignorada.',
          partido: partidoActual,
          siguiente_partido: null,
          ranking_impact: { applied: false, reason: 'resultado_ya_cargado' },
        });
      }

      return res.status(200).json({
        message: 'Request de finalizacion sin ganador_id ignorada; se requiere ganador para cerrar el partido.',
        partido: partidoActual,
      });
    }

    return cargarResultado(req, res);
  }

  if (hasProgramacion) {
    return actualizarProgramacion(req, res);
  }

  if (estado === 'programado') {
    return actualizarEstadoPartidoSimple(req, res, 'programado');
  }

  const { id: partido_id } = req.params;
  if (!UUID_REGEX.test(partido_id)) {
    return res.status(400).json({ error: 'El partido_id es invalido.' });
  }

  const { data: partidoActual, error: errFind } = await fetchPartidoCompat(partido_id);
  if (errFind || !partidoActual) {
    return res.status(200).json({
      message: 'Partido no encontrado. Request ignorada por compatibilidad de control en vivo.',
      partido: null,
    });
  }

  return res.status(200).json({
    message: 'Payload recibido sin cambios aplicables para control en vivo.',
    partido: partidoActual,
  });
};

module.exports = {
  cargarResultado,
  actualizarProgramacion,
  empezarPartido,
  actualizarMarcadorEnVivo,
  actualizarPartidoEnVivo,
  reprogramarPartido: actualizarProgramacion,
  actualizarHorario: actualizarProgramacion,
};
