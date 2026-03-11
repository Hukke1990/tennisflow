const supabase = require('../services/supabase');

const DEFAULT_INSCRIBIBLE_STATE = 'publicado';
const INSCRIBIBLE_STATES = new Set(['publicado', 'abierto']);
const NON_AVAILABLE_STATES = new Set(['cancelado', 'finalizado']);
const VALID_TOURNAMENT_STATES = new Set([
  'borrador',
  'publicado',
  'abierto',
  'en_progreso',
  'finalizado',
  'cancelado',
]);
const VALID_MODALIDADES = new Set(['Singles', 'Dobles']);
const VALID_RAMAS = new Set(['Masculino', 'Femenino', 'Mixto']);
const ROUND_POINT_ORDERS = [32, 16, 8, 4, 2];
const DEFAULT_POINTS_BY_ROUND = {
  32: 5,
  16: 10,
  8: 25,
  4: 50,
  2: 100,
};
const DEFAULT_CHAMPION_POINTS = 100;

const parseNonNegativeInteger = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
};

const normalizePointsByRound = (body = {}) => {
  const nested = body.puntos_por_ronda && typeof body.puntos_por_ronda === 'object'
    ? body.puntos_por_ronda
    : {};

  const pointsByRound = {};

  for (const roundOrder of ROUND_POINT_ORDERS) {
    const directRaw = body[`puntos_ronda_${roundOrder}`];
    const nestedRaw = nested[String(roundOrder)];
    const raw = directRaw ?? nestedRaw;

    if (raw === undefined || raw === null || raw === '') {
      pointsByRound[roundOrder] = DEFAULT_POINTS_BY_ROUND[roundOrder] || 0;
      continue;
    }

    const parsed = parseNonNegativeInteger(raw);
    if (parsed === null) {
      return { error: `puntos_ronda_${roundOrder} debe ser un entero mayor o igual a 0.` };
    }

    pointsByRound[roundOrder] = parsed;
  }

  return { data: pointsByRound, error: null };
};

const normalizeChampionPoints = (body = {}, pointsByRound = {}) => {
  const nested = body.puntos_por_ronda && typeof body.puntos_por_ronda === 'object'
    ? body.puntos_por_ronda
    : {};

  const raw = body.puntos_campeon
    ?? body.puntos_ronda_1
    ?? nested.campeon
    ?? nested.champion
    ?? nested['1'];

  if (raw === undefined || raw === null || raw === '') {
    const fallback = parseNonNegativeInteger(pointsByRound[2]);
    if (fallback !== null) {
      return { data: fallback, error: null };
    }
    return { data: DEFAULT_CHAMPION_POINTS, error: null };
  }

  const parsed = parseNonNegativeInteger(raw);
  if (parsed === null) {
    return { error: 'puntos_campeon debe ser un entero mayor o igual a 0.' };
  }

  return { data: parsed, error: null };
};

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
  if (!Number.isInteger(categoria) || categoria < 1 || categoria > 5) {
    return null;
  }
  return categoria;
};

const resolveCategoriaPerfilPorModalidad = (perfil, modalidad) => {
  if (!perfil) return null;

  if (modalidad === 'Dobles') {
    return parseCategoria(perfil.categoria_dobles ?? perfil.categoria);
  }

  return parseCategoria(perfil.categoria_singles ?? perfil.categoria);
};

const fetchPerfilCompat = async (jugadorId) => {
  const profileSelectOptions = [
    'id, sexo, categoria, categoria_singles, categoria_dobles',
    'id, sexo, categoria_singles, categoria_dobles',
    'id, sexo, categoria',
    'id, sexo',
    'id, categoria, categoria_singles, categoria_dobles',
    'id, categoria_singles, categoria_dobles',
    'id, categoria',
    'id',
  ];

  let lastError = null;

  for (const selectColumns of profileSelectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(selectColumns)
      .eq('id', jugadorId)
      .single();

    if (!error && data) {
      return { data, error: null };
    }

    lastError = error;

    const isMissingColumn = error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
    if (!isMissingColumn) {
      break;
    }
  }

  return { data: null, error: lastError };
};

const normalizeTournamentState = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  const aliasMap = {
    inscripcion: 'publicado',
    abierto_inscripcion: 'abierto',
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

  if (aliasMap[normalized]) {
    return aliasMap[normalized];
  }

  if (normalized === 'inscripcion') {
    return DEFAULT_INSCRIBIBLE_STATE;
  }

  return normalized;
};

const isValidTournamentState = (value) => {
  return typeof value === 'string' && VALID_TOURNAMENT_STATES.has(value);
};

const parseDateSafe = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toUtcDateOnly = (value) => {
  const parsed = parseDateSafe(value);
  if (!parsed) return null;

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const toDateOnlyString = (value) => {
  const parsed = toUtcDateOnly(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
};

const parseTimeToMinutes = (timeValue) => {
  if (typeof timeValue !== 'string') return null;

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(timeValue.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isMissingColumnError = (error) => {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
};

const normalizeAssignedCanchas = (body) => {
  const hasCanchasAsignadas = body.canchas_asignadas !== undefined;
  const hasCanchasIds = body.canchas_ids !== undefined;

  if (!hasCanchasAsignadas && !hasCanchasIds) {
    return { ids: [] };
  }

  const sources = [];

  if (hasCanchasAsignadas) {
    if (!Array.isArray(body.canchas_asignadas)) {
      return { error: 'canchas_asignadas debe ser un arreglo de ids.' };
    }
    sources.push(...body.canchas_asignadas);
  }

  if (hasCanchasIds) {
    if (!Array.isArray(body.canchas_ids)) {
      return { error: 'canchas_ids debe ser un arreglo de ids.' };
    }
    sources.push(...body.canchas_ids);
  }

  const deduplicated = [...new Set(
    sources
      .map((id) => (typeof id === 'string' ? id.trim() : String(id || '').trim()))
      .filter(Boolean),
  )];

  const invalidId = deduplicated.find((id) => !UUID_REGEX.test(id));
  if (invalidId) {
    return { error: `El id de cancha ${invalidId} no es un UUID valido.` };
  }

  return { ids: deduplicated };
};

const validateAssignedCanchas = async (canchaIds) => {
  if (!canchaIds || canchaIds.length === 0) {
    return { ok: true, canchas: [] };
  }

  const { data, error } = await supabase
    .from('canchas')
    .select('id, esta_disponible')
    .in('id', canchaIds);

  if (error) {
    return { ok: false, status: 500, error: 'Error al validar canchas asignadas.', details: error.message };
  }

  const canchas = data || [];
  const foundIds = new Set(canchas.map((c) => c.id));
  const missingIds = canchaIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'Una o mas canchas asignadas no existen.',
      missingIds,
    };
  }

  const unavailableIds = canchas.filter((c) => c.esta_disponible !== true).map((c) => c.id);
  if (unavailableIds.length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'Una o mas canchas asignadas no estan disponibles.',
      unavailableIds,
    };
  }

  return { ok: true, canchas };
};

const fetchPartidosEstadoCanchasCompat = async (torneoId, canchaIds) => {
  const selectOptions = [
    'id, cancha_id, fecha_hora, estado, ronda, ronda_orden, jugador1_id, jugador2_id, ganador_id, marcador_en_vivo, ultima_actualizacion, inicio_real',
    'id, cancha_id, fecha_hora, estado, ronda, ronda_orden, jugador1_id, jugador2_id, ganador_id',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('partidos')
      .select(columns)
      .eq('torneo_id', torneoId)
      .in('cancha_id', canchaIds)
      .order('fecha_hora', { ascending: true });

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

const validateTournamentDateRules = ({
  fecha_inicio,
  fecha_fin,
  fecha_inicio_inscripcion,
  fecha_cierre_inscripcion,
}) => {
  const inicio = parseDateSafe(fecha_inicio);
  const fin = parseDateSafe(fecha_fin);
  const inicioInscripcion = parseDateSafe(fecha_inicio_inscripcion);
  const cierreInscripcion = parseDateSafe(fecha_cierre_inscripcion);

  if (!inicio || !fin || !inicioInscripcion || !cierreInscripcion) {
    return 'Las fechas del torneo son invalidas o estan incompletas.';
  }

  if (fin < inicio) {
    return 'La fecha_fin no puede ser anterior a fecha_inicio.';
  }

  if (inicioInscripcion > cierreInscripcion) {
    return 'La fecha_inicio_inscripcion no puede ser mayor a fecha_cierre_inscripcion.';
  }

  if (cierreInscripcion > inicio) {
    return 'La fecha_cierre_inscripcion no puede ser posterior a fecha_inicio.';
  }

  return null;
};

const buildTournamentPayload = (body) => {
  const modalidadInput = body.modalidad ?? body.tipo_modalidad ?? body.tipoModalidad ?? body.tipo;
  const ramaInput = body.rama ?? body.sexo ?? body.genero;
  const categoriaInput = body.categoria_id ?? body.categoriaId ?? body.categoria;

  const payload = {
    titulo: typeof body.titulo === 'string' ? body.titulo.trim() : body.titulo,
    cupos_max: Number(body.cupos_max),
    costo: body.costo === undefined || body.costo === null || body.costo === '' ? 0 : Number(body.costo),
    fecha_inicio: body.fecha_inicio,
    fecha_fin: body.fecha_fin,
    fecha_inicio_inscripcion: body.fecha_inicio_inscripcion,
    fecha_cierre_inscripcion: body.fecha_cierre_inscripcion,
  };

  if (modalidadInput !== undefined) {
    const modalidad = normalizeModalidad(modalidadInput);
    payload.modalidad = modalidad ?? modalidadInput;
  }

  if (ramaInput !== undefined) {
    const rama = normalizeRama(ramaInput);
    payload.rama = rama ?? ramaInput;
  }

  if (categoriaInput !== undefined) {
    const categoriaId = parseCategoria(categoriaInput);
    payload.categoria_id = categoriaId ?? categoriaInput;
  }

  if (body.estado !== undefined) {
    payload.estado = normalizeTournamentState(body.estado);
  }

  return payload;
};

const formatTournamentListItem = (torneo) => {
  const inscritosCount = Number(torneo.inscripciones?.[0]?.count || 0);
  const puntosPorRonda = {
    32: Number(torneo.puntos_ronda_32 || 0),
    16: Number(torneo.puntos_ronda_16 || 0),
    8: Number(torneo.puntos_ronda_8 || 0),
    4: Number(torneo.puntos_ronda_4 || 0),
    2: Number(torneo.puntos_ronda_2 || 0),
  };
  const puntosCampeon = Number((torneo.puntos_campeon ?? puntosPorRonda[2]) || 0);
  puntosPorRonda[1] = puntosCampeon;

  return {
    id: torneo.id,
    titulo: torneo.titulo,
    estado: torneo.estado,
    costo: torneo.costo,
    cupos_max: torneo.cupos_max,
    inscritos: inscritosCount,
    inscritos_count: inscritosCount,
    fecha_inicio: torneo.fecha_inicio,
    fecha_fin: torneo.fecha_fin,
    modalidad: torneo.modalidad ?? null,
    rama: torneo.rama ?? null,
    categoria_id: torneo.categoria_id ?? null,
    puntos_ronda_32: puntosPorRonda[32],
    puntos_ronda_16: puntosPorRonda[16],
    puntos_ronda_8: puntosPorRonda[8],
    puntos_ronda_4: puntosPorRonda[4],
    puntos_ronda_2: puntosPorRonda[2],
    puntos_campeon: puntosCampeon,
    puntos_por_ronda: puntosPorRonda,
    fecha_inicio_inscripcion: torneo.fecha_inicio_inscripcion,
    fecha_cierre_inscripcion: torneo.fecha_cierre_inscripcion,
  };
};

const crearTorneo = async (req, res) => {
  try {
    const {
      titulo,
      cupos_max,
      costo,
      fecha_inicio,
      fecha_fin,
      fecha_inicio_inscripcion,
      fecha_cierre_inscripcion,
    } = req.body;

    if (
      !titulo ||
      cupos_max === undefined ||
      !fecha_inicio ||
      !fecha_fin ||
      !fecha_inicio_inscripcion ||
      !fecha_cierre_inscripcion
    ) {
      return res.status(400).json({
        error: 'Faltan campos obligatorios: titulo, cupos_max, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion.',
      });
    }

    const payload = buildTournamentPayload({
      titulo,
      cupos_max,
      costo,
      modalidad: req.body.modalidad,
      tipo_modalidad: req.body.tipo_modalidad,
      tipoModalidad: req.body.tipoModalidad,
      tipo: req.body.tipo,
      rama: req.body.rama,
      sexo: req.body.sexo,
      genero: req.body.genero,
      categoria_id: req.body.categoria_id,
      categoriaId: req.body.categoriaId,
      categoria: req.body.categoria,
      fecha_inicio,
      fecha_fin,
      fecha_inicio_inscripcion,
      fecha_cierre_inscripcion,
      estado: req.body.estado === undefined ? DEFAULT_INSCRIBIBLE_STATE : req.body.estado,
    });

    if (!payload.titulo || typeof payload.titulo !== 'string') {
      return res.status(400).json({ error: 'El titulo es obligatorio.' });
    }

    if (!Number.isInteger(payload.cupos_max) || payload.cupos_max <= 0) {
      return res.status(400).json({ error: 'cupos_max debe ser un entero mayor a 0.' });
    }

    if (!Number.isFinite(payload.costo) || payload.costo < 0) {
      return res.status(400).json({ error: 'costo debe ser un numero mayor o igual a 0.' });
    }

    if (payload.modalidad === undefined || payload.modalidad === null || payload.modalidad === '') {
      return res.status(400).json({ error: 'modalidad es obligatoria para crear torneos.' });
    }

    if (payload.modalidad !== undefined && !VALID_MODALIDADES.has(payload.modalidad)) {
      return res.status(400).json({ error: 'modalidad debe ser Singles o Dobles.' });
    }

    if (payload.rama === undefined || payload.rama === null || payload.rama === '') {
      return res.status(400).json({ error: 'rama es obligatoria para crear torneos.' });
    }

    if (payload.rama !== undefined && !VALID_RAMAS.has(payload.rama)) {
      return res.status(400).json({ error: 'rama debe ser Masculino, Femenino o Mixto.' });
    }

    if (payload.categoria_id === undefined || payload.categoria_id === null || payload.categoria_id === '') {
      return res.status(400).json({ error: 'categoria_id es obligatoria para crear torneos.' });
    }

    if (payload.categoria_id !== undefined) {
      const categoriaId = parseCategoria(payload.categoria_id);
      if (categoriaId === null) {
        return res.status(400).json({ error: 'categoria_id debe ser un numero entre 1 y 5.' });
      }
      payload.categoria_id = categoriaId;
    }

    const { data: pointsByRound, error: pointsError } = normalizePointsByRound(req.body || {});
    if (pointsError) {
      return res.status(400).json({ error: pointsError });
    }

    const { data: championPoints, error: championPointsError } = normalizeChampionPoints(req.body || {}, pointsByRound);
    if (championPointsError) {
      return res.status(400).json({ error: championPointsError });
    }

    payload.puntos_ronda_32 = pointsByRound[32];
    payload.puntos_ronda_16 = pointsByRound[16];
    payload.puntos_ronda_8 = pointsByRound[8];
    payload.puntos_ronda_4 = pointsByRound[4];
    payload.puntos_ronda_2 = pointsByRound[2];
    payload.puntos_campeon = championPoints;

    if (!payload.estado || typeof payload.estado !== 'string') {
      return res.status(400).json({ error: 'El estado del torneo es invalido.' });
    }

    if (!isValidTournamentState(payload.estado)) {
      return res.status(400).json({ error: 'El estado del torneo no es reconocido.' });
    }

    if (payload.estado === 'borrador') {
      return res.status(400).json({ error: 'No se permite publicar torneos en estado borrador.' });
    }

    const reglasFechasError = validateTournamentDateRules(payload);
    if (reglasFechasError) {
      return res.status(400).json({ error: reglasFechasError });
    }

    const { ids: canchasIds, error: canchasParseError } = normalizeAssignedCanchas(req.body);
    if (canchasParseError) {
      return res.status(400).json({ error: canchasParseError });
    }

    const canchaValidation = await validateAssignedCanchas(canchasIds);
    if (!canchaValidation.ok) {
      const status = canchaValidation.status || 400;
      return res.status(status).json({
        error: canchaValidation.error,
        missingIds: canchaValidation.missingIds,
        unavailableIds: canchaValidation.unavailableIds,
      });
    }

    const { data, error } = await supabase
      .from('torneos')
      .insert([payload])
      .select();

    if (error) {
      console.error('Error al crear torneo:', error);
      return res.status(500).json({ error: 'Error al crear el torneo', details: error.message, code: error.code });
    }

    const torneoCreado = data[0];

    if (canchasIds.length > 0) {
      const relaciones = canchasIds.map((canchaId) => ({
        torneo_id: torneoCreado.id,
        cancha_id: canchaId,
      }));

      const { error: relationError } = await supabase
        .from('torneo_canchas')
        .insert(relaciones);

      if (relationError) {
        await supabase
          .from('torneos')
          .delete()
          .eq('id', torneoCreado.id);

        console.error('Error al asignar canchas al torneo:', relationError);
        return res.status(500).json({
          error: 'Error al asignar canchas al torneo.',
          details: relationError.message,
        });
      }
    }

    res.status(201).json({
      message: 'Torneo creado con éxito',
      torneo: torneoCreado,
      canchas_asignadas: canchasIds,
      canchas_ids: canchasIds,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarTorneo = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: torneoExistente, error: fetchError } = await supabase
      .from('torneos')
      .select('id, titulo, cupos_max, costo, estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion, modalidad, rama, categoria_id, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon')
      .eq('id', id)
      .single();

    if (fetchError || !torneoExistente) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const mergedData = {
      titulo: req.body.titulo !== undefined ? req.body.titulo : torneoExistente.titulo,
      cupos_max: req.body.cupos_max !== undefined ? req.body.cupos_max : torneoExistente.cupos_max,
      costo: req.body.costo !== undefined ? req.body.costo : torneoExistente.costo,
      fecha_inicio: req.body.fecha_inicio !== undefined ? req.body.fecha_inicio : torneoExistente.fecha_inicio,
      fecha_fin: req.body.fecha_fin !== undefined ? req.body.fecha_fin : torneoExistente.fecha_fin,
      fecha_inicio_inscripcion:
        req.body.fecha_inicio_inscripcion !== undefined
          ? req.body.fecha_inicio_inscripcion
          : torneoExistente.fecha_inicio_inscripcion,
      fecha_cierre_inscripcion:
        req.body.fecha_cierre_inscripcion !== undefined
          ? req.body.fecha_cierre_inscripcion
          : torneoExistente.fecha_cierre_inscripcion,
      modalidad: req.body.modalidad !== undefined ? req.body.modalidad : torneoExistente.modalidad,
      rama: req.body.rama !== undefined ? req.body.rama : torneoExistente.rama,
      categoria_id: req.body.categoria_id !== undefined ? req.body.categoria_id : torneoExistente.categoria_id,
      puntos_ronda_32: req.body.puntos_ronda_32 !== undefined ? req.body.puntos_ronda_32 : torneoExistente.puntos_ronda_32,
      puntos_ronda_16: req.body.puntos_ronda_16 !== undefined ? req.body.puntos_ronda_16 : torneoExistente.puntos_ronda_16,
      puntos_ronda_8: req.body.puntos_ronda_8 !== undefined ? req.body.puntos_ronda_8 : torneoExistente.puntos_ronda_8,
      puntos_ronda_4: req.body.puntos_ronda_4 !== undefined ? req.body.puntos_ronda_4 : torneoExistente.puntos_ronda_4,
      puntos_ronda_2: req.body.puntos_ronda_2 !== undefined ? req.body.puntos_ronda_2 : torneoExistente.puntos_ronda_2,
      puntos_campeon: req.body.puntos_campeon !== undefined ? req.body.puntos_campeon : torneoExistente.puntos_campeon,
      estado: req.body.estado !== undefined ? req.body.estado : torneoExistente.estado,
    };

    const payload = buildTournamentPayload(mergedData);
    if (mergedData.estado !== undefined) {
      payload.estado = normalizeTournamentState(mergedData.estado);
    }

    if (!payload.titulo || typeof payload.titulo !== 'string') {
      return res.status(400).json({ error: 'El titulo es obligatorio.' });
    }

    if (!Number.isInteger(payload.cupos_max) || payload.cupos_max <= 0) {
      return res.status(400).json({ error: 'cupos_max debe ser un entero mayor a 0.' });
    }

    if (!Number.isFinite(payload.costo) || payload.costo < 0) {
      return res.status(400).json({ error: 'costo debe ser un numero mayor o igual a 0.' });
    }

    if (payload.modalidad !== undefined && !VALID_MODALIDADES.has(payload.modalidad)) {
      return res.status(400).json({ error: 'modalidad debe ser Singles o Dobles.' });
    }

    if (payload.rama !== undefined && !VALID_RAMAS.has(payload.rama)) {
      return res.status(400).json({ error: 'rama debe ser Masculino, Femenino o Mixto.' });
    }

    if (payload.categoria_id !== undefined) {
      const categoriaId = parseCategoria(payload.categoria_id);
      if (categoriaId === null) {
        return res.status(400).json({ error: 'categoria_id debe ser un numero entre 1 y 5.' });
      }
      payload.categoria_id = categoriaId;
    }

    const { data: pointsByRound, error: pointsError } = normalizePointsByRound(mergedData);
    if (pointsError) {
      return res.status(400).json({ error: pointsError });
    }

    const { data: championPoints, error: championPointsError } = normalizeChampionPoints(mergedData, pointsByRound);
    if (championPointsError) {
      return res.status(400).json({ error: championPointsError });
    }

    payload.puntos_ronda_32 = pointsByRound[32];
    payload.puntos_ronda_16 = pointsByRound[16];
    payload.puntos_ronda_8 = pointsByRound[8];
    payload.puntos_ronda_4 = pointsByRound[4];
    payload.puntos_ronda_2 = pointsByRound[2];
    payload.puntos_campeon = championPoints;

    if (payload.estado !== undefined && !isValidTournamentState(payload.estado)) {
      return res.status(400).json({ error: 'El estado del torneo no es reconocido.' });
    }

    const reglasFechasError = validateTournamentDateRules(payload);
    if (reglasFechasError) {
      return res.status(400).json({ error: reglasFechasError });
    }

    const updatePayload = {
      titulo: payload.titulo,
      cupos_max: payload.cupos_max,
      costo: payload.costo,
      fecha_inicio: payload.fecha_inicio,
      fecha_fin: payload.fecha_fin,
      fecha_inicio_inscripcion: payload.fecha_inicio_inscripcion,
      fecha_cierre_inscripcion: payload.fecha_cierre_inscripcion,
      modalidad: payload.modalidad,
      rama: payload.rama,
      categoria_id: payload.categoria_id,
      puntos_ronda_32: payload.puntos_ronda_32,
      puntos_ronda_16: payload.puntos_ronda_16,
      puntos_ronda_8: payload.puntos_ronda_8,
      puntos_ronda_4: payload.puntos_ronda_4,
      puntos_ronda_2: payload.puntos_ronda_2,
      puntos_campeon: payload.puntos_campeon,
    };

    if (payload.estado !== undefined) {
      updatePayload.estado = payload.estado;
    }

    const { data, error } = await supabase
      .from('torneos')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error al editar torneo:', error);
      return res.status(500).json({ error: 'Error al editar el torneo', details: error.message, code: error.code });
    }

    return res.json({ message: 'Torneo actualizado con exito', torneo: data });
  } catch (err) {
    console.error('Error inesperado al editar torneo:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarTorneoCompat = async (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body);

  if (keys.length === 0) {
    return res.status(200).json({
      message: 'Sin cambios para aplicar en torneo.',
      torneo: { id: req.params.id },
    });
  }

  const stateKeys = new Set(['estado', 'state', 'status']);
  const isStateOnly = keys.every((key) => stateKeys.has(key));

  if (isStateOnly) {
    return actualizarEstadoTorneo(req, res);
  }

  const torneoBusinessKeys = new Set([
    'titulo',
    'cupos_max',
    'costo',
    'fecha_inicio',
    'fecha_fin',
    'fecha_inicio_inscripcion',
    'fecha_cierre_inscripcion',
    'modalidad',
    'tipo_modalidad',
    'tipoModalidad',
    'tipo',
    'rama',
    'sexo',
    'genero',
    'categoria_id',
    'categoriaId',
    'categoria',
    'puntos_por_ronda',
    'puntos_ronda_32',
    'puntos_ronda_16',
    'puntos_ronda_8',
    'puntos_ronda_4',
    'puntos_ronda_2',
    'puntos_campeon',
    'puntos_ronda_1',
    'canchas_asignadas',
    'canchas_ids',
  ]);

  const partidoCompatKeys = new Set([
    'partido_id',
    'partidoId',
    'ganador_id',
    'ganadorId',
    'winner_id',
    'winnerId',
    'ganador',
    'winner',
    'score',
    'resultado',
    'marcador',
    'marcador_en_vivo',
    'estado_partido',
    'finalizar',
    'ronda',
    'ronda_orden',
    'orden_en_ronda',
    'cancha_id',
    'canchaId',
    'fecha_hora',
    'fechaHora',
  ]);

  const hasPartidoCompatKeys = keys.some((key) => partidoCompatKeys.has(key));
  const hasTorneoBusinessKeys = keys.some((key) => torneoBusinessKeys.has(key));

  if (hasPartidoCompatKeys && !hasTorneoBusinessKeys) {
    return res.status(200).json({
      message: 'Payload de partido recibido en endpoint de torneo. Request ignorada por compatibilidad.',
      torneo: { id: req.params.id },
    });
  }

  return actualizarTorneo(req, res);
};

const obtenerTorneosDisponibles = async (req, res) => {
  try {
    const ahora = new Date();

    const { data: torneos, error } = await supabase
      .from('torneos')
      .select(`
        id,
        titulo,
        estado,
        costo,
        cupos_max,
        fecha_inicio,
        fecha_fin,
        modalidad,
        rama,
        categoria_id,
        puntos_ronda_32,
        puntos_ronda_16,
        puntos_ronda_8,
        puntos_ronda_4,
        puntos_ronda_2,
        puntos_campeon,
        fecha_inicio_inscripcion,
        fecha_cierre_inscripcion,
        inscripciones ( count ) 
      `)
      .order('fecha_inicio', { ascending: true });

    if (error) {
      console.error('Error al obtener torneos disponibles:', error);
      return res.status(500).json({ error: 'Error al listar torneos' });
    }

    const torneosFormateados = (torneos || [])
      .filter((t) => {
        const estadoNormalizado = normalizeTournamentState(t.estado);

        if (!INSCRIBIBLE_STATES.has(estadoNormalizado)) {
          return false;
        }

        if (NON_AVAILABLE_STATES.has(estadoNormalizado)) {
          return false;
        }

        const fechaInicioInscripcion = parseDateSafe(t.fecha_inicio_inscripcion);
        const fechaCierreInscripcion = parseDateSafe(t.fecha_cierre_inscripcion);

        if (!fechaInicioInscripcion || !fechaCierreInscripcion) {
          return false;
        }

        if (fechaInicioInscripcion && ahora < fechaInicioInscripcion) {
          return false;
        }

        if (fechaCierreInscripcion && ahora > fechaCierreInscripcion) {
          return false;
        }

        return true;
      })
      .map((t) => {
        const inscritos = Number(t.inscripciones?.[0]?.count || 0);

        return {
          ...formatTournamentListItem(t),
          disponible: inscritos < t.cupos_max,
          inscripciones: undefined,
        };
      });

    res.json(torneosFormateados);
  } catch (err) {
    console.error('Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtenerTodosLosTorneos = async (req, res) => {
  try {
    const { data: torneos, error } = await supabase
      .from('torneos')
      .select(`
        id,
        titulo,
        estado,
        costo,
        cupos_max,
        fecha_inicio,
        fecha_fin,
        modalidad,
        rama,
        categoria_id,
        puntos_ronda_32,
        puntos_ronda_16,
        puntos_ronda_8,
        puntos_ronda_4,
        puntos_ronda_2,
        puntos_campeon,
        fecha_inicio_inscripcion,
        fecha_cierre_inscripcion,
        inscripciones ( count )
      `)
      .order('fecha_inicio', { ascending: false });

    if (error) {
      console.error('Error al obtener todos los torneos:', error);
      return res.status(500).json({ error: 'Error al listar torneos' });
    }

    const torneosFormateados = (torneos || []).map((t) => {
      const item = formatTournamentListItem(t);
      return {
        ...item,
        disponible: item.inscritos < t.cupos_max,
      };
    });

    res.json(torneosFormateados);
  } catch (err) {
    console.error('Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const inscribirJugador = async (req, res) => {
  try {
    const torneo_id = req.params.torneoId || req.params.id;
    const { jugador_id, disponibilidad_inscripcion, disponibilidad } = req.body;
    const franjasEntrada = Array.isArray(disponibilidad_inscripcion)
      ? disponibilidad_inscripcion
      : disponibilidad;

    if (!jugador_id) {
      return res.status(400).json({ error: 'Falta el ID del jugador' });
    }

    if (!Array.isArray(franjasEntrada) || franjasEntrada.length === 0) {
      return res.status(400).json({
        error: 'disponibilidad_inscripcion (o disponibilidad legacy) debe ser un arreglo no vacio.',
      });
    }

    const { data: torneoInfo, error: torneoError } = await supabase
      .from('torneos')
      .select('cupos_max, estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion, modalidad, rama, categoria_id')
      .eq('id', torneo_id)
      .single();

    if (torneoError || !torneoInfo) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const estadoTorneo = normalizeTournamentState(torneoInfo.estado);
    if (!INSCRIBIBLE_STATES.has(estadoTorneo)) {
      return res.status(409).json({ error: 'El torneo no está publicado para inscripción.' });
    }

    const ahora = new Date();
    const inicioInscripcion = parseDateSafe(torneoInfo.fecha_inicio_inscripcion);
    const cierreInscripcion = parseDateSafe(torneoInfo.fecha_cierre_inscripcion);

    if (!inicioInscripcion || !cierreInscripcion || ahora < inicioInscripcion || ahora > cierreInscripcion) {
      return res.status(409).json({ error: 'El periodo de inscripción para este torneo no está activo.' });
    }

    const modalidadTorneo = normalizeModalidad(torneoInfo.modalidad);
    const ramaTorneo = normalizeRama(torneoInfo.rama);
    const categoriaTorneo = parseCategoria(torneoInfo.categoria_id);

    if (!modalidadTorneo || !ramaTorneo || categoriaTorneo === null) {
      return res.status(409).json({
        error: 'El torneo no tiene definidos modalidad/rama/categoria para validar inscripciones.',
      });
    }

    const { data: perfilJugador, error: perfilError } = await fetchPerfilCompat(jugador_id);
    if (perfilError || !perfilJugador) {
      return res.status(404).json({ error: 'Perfil del jugador no encontrado.' });
    }

    const sexoJugador = normalizeRama(perfilJugador.sexo);
    const categoriaJugador = resolveCategoriaPerfilPorModalidad(perfilJugador, modalidadTorneo);

    if (!sexoJugador || categoriaJugador === null) {
      return res.status(409).json({
        error: 'El perfil del jugador no tiene sexo/categoria configurados para esta modalidad.',
      });
    }

    const sexoCoincide = ramaTorneo === 'Mixto' ? true : sexoJugador === ramaTorneo;
    const categoriaCoincide = categoriaJugador === categoriaTorneo;

    if (!sexoCoincide || !categoriaCoincide) {
      return res.status(409).json({
        error: 'No cumples con los requisitos del torneo. El boton Inscribirme solo debe habilitarse si sexo y categoria coinciden con el torneo.',
        requisitos: {
          modalidad: modalidadTorneo,
          rama: ramaTorneo,
          categoria_id: categoriaTorneo,
        },
        perfil: {
          sexo: sexoJugador,
          categoria: categoriaJugador,
        },
      });
    }

    const fechaInicioTorneo = toUtcDateOnly(torneoInfo.fecha_inicio);
    const fechaFinTorneo = toUtcDateOnly(torneoInfo.fecha_fin);
    if (!fechaInicioTorneo || !fechaFinTorneo) {
      return res.status(409).json({ error: 'El torneo no tiene definido un rango valido de fechas.' });
    }

    const franjasNormalizadas = [];

    for (let i = 0; i < franjasEntrada.length; i += 1) {
      const franja = franjasEntrada[i] || {};
      const { fecha, dia_semana, hora_inicio, hora_fin } = franja;

      if (!fecha || dia_semana === undefined || !hora_inicio || !hora_fin) {
        return res.status(400).json({
          error: `La franja ${i + 1} es invalida. Requiere fecha, dia_semana, hora_inicio y hora_fin.`,
        });
      }

      const diaSemanaInt = Number(dia_semana);
      if (!Number.isInteger(diaSemanaInt) || diaSemanaInt < 0 || diaSemanaInt > 6) {
        return res.status(400).json({ error: `La franja ${i + 1} tiene dia_semana fuera de rango (0..6).` });
      }

      const horaInicioMin = parseTimeToMinutes(hora_inicio);
      const horaFinMin = parseTimeToMinutes(hora_fin);
      if (horaInicioMin === null || horaFinMin === null || horaInicioMin >= horaFinMin) {
        return res.status(400).json({ error: `La franja ${i + 1} tiene un rango horario invalido.` });
      }

      const fechaFranja = toUtcDateOnly(fecha);
      if (!fechaFranja) {
        return res.status(400).json({ error: `La franja ${i + 1} tiene una fecha invalida.` });
      }

      if (fechaFranja < fechaInicioTorneo || fechaFranja > fechaFinTorneo) {
        return res.status(400).json({
          error: `La franja ${i + 1} esta fuera del rango [fecha_inicio, fecha_fin] del torneo.`,
        });
      }

      franjasNormalizadas.push({
        torneo_id,
        jugador_id,
        fecha: toDateOnlyString(fecha),
        dia_semana: diaSemanaInt,
        hora_inicio: hora_inicio.trim(),
        hora_fin: hora_fin.trim(),
        es_obligatoria_fin_semana: Boolean(franja.es_obligatoria_fin_semana),
      });
    }

    const { count, error: countError } = await supabase
      .from('inscripciones')
      .select('*', { count: 'exact', head: true })
      .eq('torneo_id', torneo_id)
      .eq('estado', 'confirmada');

    if (countError) {
      return res.status(500).json({ error: 'Error al verificar cupos disponibles' });
    }

    const estaLleno = count >= torneoInfo.cupos_max;
    const estadoInscripcion = estaLleno ? 'lista_espera' : 'confirmada';

    const { data: inscripcion, error: insertError } = await supabase
      .from('inscripciones')
      .insert([{ torneo_id, jugador_id, estado: estadoInscripcion, pago_confirmado: true }])
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'El jugador ya esta inscrito o en lista de espera en este torneo.' });
      }
      console.error('Error al inscribir:', insertError);
      return res.status(500).json({ error: 'Error al procesar la inscripción' });
    }

    const { error: deleteDispError } = await supabase
      .from('disponibilidad_inscripcion')
      .delete()
      .eq('torneo_id', torneo_id)
      .eq('jugador_id', jugador_id);

    if (deleteDispError) {
      await supabase.from('inscripciones').delete().eq('id', inscripcion.id);
      console.error('Error al limpiar disponibilidad de inscripcion previa:', deleteDispError);
      return res.status(500).json({ error: 'Error al guardar la disponibilidad de inscripcion.' });
    }

    const { error: dispInsertError } = await supabase
      .from('disponibilidad_inscripcion')
      .insert(franjasNormalizadas);

    if (dispInsertError) {
      await supabase.from('inscripciones').delete().eq('id', inscripcion.id);
      console.error('Error al guardar disponibilidad de inscripcion:', dispInsertError);
      return res.status(500).json({ error: 'Error al guardar la disponibilidad de inscripcion.' });
    }

    res.status(201).json({
      message: estaLleno
        ? 'Torneo lleno. Has sido añadido a la lista de espera.'
        : 'Inscripción confirmada exitosamente.',
      inscripcion,
      estado: estadoInscripcion,
      disponibilidad_guardada: franjasNormalizadas.length,
    });

  } catch (err) {
    console.error('Error inesperado en inscripción:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarEstadoTorneo = async (req, res) => {
  try {
    const { id } = req.params;
    const estadoInput = req.body?.estado ?? req.body?.state ?? req.body?.status;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'El torneoId es invalido.' });
    }

    const estadoNormalizado = typeof estadoInput === 'string' ? normalizeTournamentState(estadoInput) : null;
    const estado = isValidTournamentState(estadoNormalizado) ? estadoNormalizado : 'en_progreso';

    const { data, error } = await supabase
      .from('torneos')
      .update({ estado })
      .eq('id', id)
      .select('id, estado')
      .single();

    if (error || !data) {
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ error: 'Torneo no encontrado' });
      }

      console.error('Error al actualizar estado del torneo:', error);
      return res.status(500).json({ error: 'Error al actualizar estado del torneo' });
    }

    return res.status(200).json({ message: 'Estado del torneo actualizado.', torneo: data });
  } catch (err) {
    console.error('Error inesperado al actualizar estado del torneo:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtenerCanchasDelTorneo = async (req, res) => {
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

    const { data: relaciones, error: relacionesError } = await supabase
      .from('torneo_canchas')
      .select('cancha_id')
      .eq('torneo_id', torneoId);

    if (relacionesError) {
      console.error('Error al obtener canchas del torneo:', relacionesError);
      return res.status(500).json({ error: 'Error al obtener canchas del torneo' });
    }

    const canchaIds = [...new Set((relaciones || []).map((r) => r.cancha_id).filter(Boolean))];
    if (canchaIds.length === 0) {
      return res.status(200).json([]);
    }

    const { data: canchas, error: canchasError } = await supabase
      .from('canchas')
      .select('id, nombre, tipo_superficie, esta_disponible, descripcion')
      .in('id', canchaIds)
      .order('nombre', { ascending: true });

    if (canchasError) {
      console.error('Error al listar canchas asignadas:', canchasError);
      return res.status(500).json({ error: 'Error al obtener canchas del torneo' });
    }

    return res.status(200).json(canchas || []);
  } catch (err) {
    console.error('Error inesperado al obtener canchas del torneo:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtenerEstadoCanchas = async (req, res) => {
  try {
    const torneoId = req.params.id;

    if (!UUID_REGEX.test(torneoId)) {
      return res.status(400).json({ error: 'El torneoId es invalido.' });
    }

    const { data: torneo, error: torneoError } = await supabase
      .from('torneos')
      .select('id, titulo, estado')
      .eq('id', torneoId)
      .single();

    if (torneoError || !torneo) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const { data: relaciones, error: relacionesError } = await supabase
      .from('torneo_canchas')
      .select('cancha_id')
      .eq('torneo_id', torneoId);

    if (relacionesError) {
      console.error('Error al obtener relaciones torneo_canchas:', relacionesError);
      return res.status(500).json({ error: 'Error al obtener estado de canchas' });
    }

    const canchaIds = [...new Set((relaciones || []).map((r) => r.cancha_id).filter(Boolean))];
    if (canchaIds.length === 0) {
      return res.status(200).json({
        torneo: { id: torneo.id, titulo: torneo.titulo, estado: torneo.estado },
        canchas: [],
      });
    }

    const { data: canchas, error: canchasError } = await supabase
      .from('canchas')
      .select('id, nombre, tipo_superficie, esta_disponible')
      .in('id', canchaIds)
      .order('nombre', { ascending: true });

    if (canchasError) {
      console.error('Error al listar canchas del torneo:', canchasError);
      return res.status(500).json({ error: 'Error al obtener estado de canchas' });
    }

    const { data: partidos, error: partidosError } = await fetchPartidosEstadoCanchasCompat(torneoId, canchaIds);
    if (partidosError) {
      console.error('Error al obtener partidos por cancha:', partidosError);
      return res.status(500).json({ error: 'Error al obtener estado de canchas' });
    }

    const jugadorIds = [...new Set((partidos || []).flatMap((p) => [p.jugador1_id, p.jugador2_id]).filter(Boolean))];

    let perfilById = new Map();
    if (jugadorIds.length > 0) {
      const { data: perfiles, error: perfilesError } = await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .in('id', jugadorIds);

      if (perfilesError) {
        console.error('Error al obtener perfiles para estado de canchas:', perfilesError);
        return res.status(500).json({ error: 'Error al obtener estado de canchas' });
      }

      perfilById = new Map((perfiles || []).map((perfil) => [perfil.id, perfil]));
    }

    const nowMs = Date.now();
    const buildPartido = (partido) => {
      if (!partido) return null;
      return {
        ...partido,
        jugador1: partido.jugador1_id
          ? { id: partido.jugador1_id, nombre_completo: perfilById.get(partido.jugador1_id)?.nombre_completo || null }
          : null,
        jugador2: partido.jugador2_id
          ? { id: partido.jugador2_id, nombre_completo: perfilById.get(partido.jugador2_id)?.nombre_completo || null }
          : null,
      };
    };

    const byCancha = new Map();
    for (const partido of (partidos || [])) {
      if (!partido?.cancha_id) continue;
      if (!byCancha.has(partido.cancha_id)) byCancha.set(partido.cancha_id, []);
      byCancha.get(partido.cancha_id).push(partido);
    }

    const canchasEstado = (canchas || []).map((cancha) => {
      const partidosCancha = (byCancha.get(cancha.id) || []).slice().sort((a, b) => {
        const aMs = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Number.MAX_SAFE_INTEGER;
        const bMs = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Number.MAX_SAFE_INTEGER;
        return aMs - bMs;
      });

      const partidoActual = partidosCancha.find((p) => p.estado === 'en_juego') || null;

      let proximoPartido = null;
      if (partidoActual) {
        const baseMs = partidoActual.fecha_hora ? new Date(partidoActual.fecha_hora).getTime() : nowMs;
        proximoPartido = partidosCancha.find((p) => {
          if (p.id === partidoActual.id) return false;
          if (p.estado !== 'programado') return false;
          if (!p.fecha_hora) return true;
          return new Date(p.fecha_hora).getTime() >= baseMs;
        }) || null;
      } else {
        proximoPartido = partidosCancha.find((p) => {
          if (p.estado !== 'programado') return false;
          if (!p.fecha_hora) return true;
          return new Date(p.fecha_hora).getTime() >= nowMs;
        })
        || partidosCancha.find((p) => p.estado === 'programado')
        || null;
      }

      const partidosRestantes = partidosCancha.filter((p) => p.estado !== 'finalizado').length;

      return {
        cancha,
        estado_cancha: partidoActual ? 'ocupada' : 'libre',
        partido_actual: buildPartido(partidoActual),
        proximo_partido: buildPartido(proximoPartido),
        partidos_restantes: partidosRestantes,
      };
    });

    return res.status(200).json({
      torneo: { id: torneo.id, titulo: torneo.titulo, estado: torneo.estado },
      canchas: canchasEstado,
      ultima_actualizacion: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error inesperado al obtener estado de canchas:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};


module.exports = {
  crearTorneo,
  actualizarTorneo,
  actualizarTorneoCompat,
  obtenerTorneosDisponibles,
  obtenerTodosLosTorneos,
  inscribirJugador,
  obtenerCanchasDelTorneo,
  obtenerEstadoCanchas,
  actualizarEstadoTorneo,
};
