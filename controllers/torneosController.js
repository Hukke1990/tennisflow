const supabase = require('../services/supabase');
const { randomUUID } = require('crypto');

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
const INSCRIPTION_STATUS_PENDING = 'pendiente';
const INSCRIPTION_STATUS_APPROVED = 'aprobada';
const INSCRIPTION_STATUS_REJECTED = 'rechazada';
const ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY = 'inscripciones_whatsapp_template';
const DEFAULT_WHATSAPP_TEMPLATE = 'Hola {jugador}, te contacto por tu solicitud de inscripcion al {torneo}.';
const MAX_WHATSAPP_TEMPLATE_LENGTH = 1000;

const normalizeInscriptionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) return '';
  if (normalized === 'pending') return INSCRIPTION_STATUS_PENDING;
  if (normalized === 'approved' || normalized === 'aprobar') return INSCRIPTION_STATUS_APPROVED;
  if (normalized === 'rejected' || normalized === 'rechazar') return INSCRIPTION_STATUS_REJECTED;
  if (normalized === INSCRIPTION_STATUS_PENDING) return INSCRIPTION_STATUS_PENDING;
  if (normalized === INSCRIPTION_STATUS_APPROVED) return INSCRIPTION_STATUS_APPROVED;
  if (normalized === INSCRIPTION_STATUS_REJECTED) return INSCRIPTION_STATUS_REJECTED;
  return '';
};

const normalizeLegacyInscriptionState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';

  if (normalized === 'confirmada') return 'confirmada';
  if (normalized === 'lista_espera' || normalized === 'pendiente' || normalized === 'pendiente_revision') return 'pendiente';
  if (normalized === 'cancelada' || normalized === 'rechazada') return 'rechazada';

  return normalized;
};

const resolveInscriptionStatusCompat = (row = {}) => {
  const fromNewColumn = normalizeInscriptionStatus(row.estado_inscripcion);
  if (fromNewColumn) {
    return fromNewColumn;
  }

  const legacy = normalizeLegacyInscriptionState(row.estado);
  if (legacy === 'confirmada') return INSCRIPTION_STATUS_APPROVED;
  if (legacy === 'pendiente') return INSCRIPTION_STATUS_PENDING;
  if (legacy === 'rechazada') return INSCRIPTION_STATUS_REJECTED;

  return '';
};

const mapLegacyStateFromInscriptionStatus = (status) => {
  if (status === INSCRIPTION_STATUS_APPROVED) return 'confirmada';
  if (status === INSCRIPTION_STATUS_REJECTED) return 'cancelada';
  return 'pendiente';
};

const aggregateInscriptionSummaryByTournamentId = (rows = []) => {
  const summaryByTournament = new Map();

  for (const row of rows || []) {
    const torneoId = String(row?.torneo_id || '').trim();
    if (!torneoId) continue;

    if (!summaryByTournament.has(torneoId)) {
      summaryByTournament.set(torneoId, {
        aprobadas: 0,
        pendientes: 0,
        rechazadas: 0,
      });
    }

    const current = summaryByTournament.get(torneoId);
    const status = resolveInscriptionStatusCompat(row);

    if (status === INSCRIPTION_STATUS_APPROVED) current.aprobadas += 1;
    if (status === INSCRIPTION_STATUS_PENDING) current.pendientes += 1;
    if (status === INSCRIPTION_STATUS_REJECTED) current.rechazadas += 1;
  }

  return summaryByTournament;
};

const fetchInscriptionRowsByTournamentIdsCompat = async (torneoIds = [], clubId) => {
  const normalizedIds = [...new Set((torneoIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return { data: [], error: null };
  }

  const selectOptions = [
    'torneo_id, estado, estado_inscripcion',
    'torneo_id, estado',
  ];

  let lastError = null;

  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones')
      .select(columns)
      .eq('club_id', clubId)
      .in('torneo_id', normalizedIds);

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

const fetchTournamentInscriptionSummaryCompat = async (torneoIds = [], clubId) => {
  const { data, error } = await fetchInscriptionRowsByTournamentIdsCompat(torneoIds, clubId);
  if (error) {
    return { summaryByTournament: new Map(), error };
  }

  return {
    summaryByTournament: aggregateInscriptionSummaryByTournamentId(data || []),
    error: null,
  };
};

const emitPendingInscriptionsUpdated = (payload = {}) => {
  try {
    const io = global.__tennisflow_io;
    if (!io || typeof io.emit !== 'function') return;

    io.emit('inscripciones_pendientes_actualizadas', {
      ts: new Date().toISOString(),
      ...payload,
    });
  } catch (_) {
    // No-op: evitar romper el flujo principal por un problema de socket.
  }
};

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

const fetchPerfilCompat = async (jugadorId, clubId) => {
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
      .eq('club_id', clubId)
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

const isDoblesModalidad = (modalidad) => normalizeModalidad(modalidad) === 'Dobles';

const fetchInscripcionByTournamentPlayerCompat = async ({ torneoId, jugadorId, clubId }) => {
  const selectOptions = [
    'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion',
    'id, torneo_id, jugador_id, estado, estado_inscripcion',
    'id, torneo_id, jugador_id, estado',
  ];

  let lastError = null;
  for (const selectColumns of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones')
      .select(selectColumns)
      .eq('torneo_id', torneoId)
      .eq('jugador_id', jugadorId)
      .eq('club_id', clubId)
      .single();

    if (!error) {
      return { data, error: null };
    }

    if (error?.code === 'PGRST116') {
      return { data: null, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      break;
    }
  }

  return { data: null, error: lastError };
};

const areOppositeSexes = (sexoA, sexoB) => {
  if (!sexoA || !sexoB) return false;
  return (
    (sexoA === 'Masculino' && sexoB === 'Femenino')
    || (sexoA === 'Femenino' && sexoB === 'Masculino')
  );
};

const normalizeQueryText = (value) => String(value || '').trim();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveClubIdFromRequest = (req) => {
  const rawClubId = req.query?.club_id ?? req.headers?.['x-club-id'];
  const clubId = String(rawClubId || '').trim();

  if (!clubId) {
    return { clubId: null, error: 'club_id es obligatorio.' };
  }

  if (!UUID_REGEX.test(clubId)) {
    return { clubId: null, error: 'club_id debe ser un UUID valido.' };
  }

  return { clubId, error: null };
};

const isMissingColumnError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '');

  if (code === '42703' || code === 'PGRST204') {
    return true;
  }

  if (/column .* does not exist/i.test(message)) {
    return true;
  }

  // Supabase/PostgREST puede responder asi cuando falta una columna en schema cache.
  if (/could not find the '.*' column/i.test(message)) {
    return true;
  }

  return /schema cache/i.test(message) && /column/i.test(message);
};

const isMissingRelationError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '');

  // PGRST200 = Could not find a relationship between tables (FK not in schema cache or doesn't exist)
  if (code === '42P01' || code === 'PGRST200' || code === 'PGRST205') {
    return true;
  }

  if (/relation .* does not exist/i.test(message)) {
    return true;
  }

  if (/could not find a relationship/i.test(message)) {
    return true;
  }

  return /could not find the table/i.test(message) || /schema cache/i.test(message) && /table/i.test(message);
};

const getInscripcionesWhatsappTemplate = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('configuracion_admin')
      .select('clave, valor, updated_at')
      .eq('clave', ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY)
      .single();

    if (!error) {
      const template = String(data?.valor || '').trim() || DEFAULT_WHATSAPP_TEMPLATE;
      return res.status(200).json({
        template,
        clave: ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
        updated_at: data?.updated_at || null,
        source: 'database',
      });
    }

    if (error?.code === 'PGRST116' || isMissingRelationError(error)) {
      return res.status(200).json({
        template: DEFAULT_WHATSAPP_TEMPLATE,
        clave: ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
        updated_at: null,
        source: 'default',
      });
    }

    console.error('Error al obtener plantilla de WhatsApp:', error);
    return res.status(500).json({ error: 'No se pudo obtener la plantilla de WhatsApp.' });
  } catch (err) {
    console.error('Error inesperado al obtener plantilla de WhatsApp:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const updateInscripcionesWhatsappTemplate = async (req, res) => {
  try {
    const templateRaw = String(req.body?.template || '').trim();
    if (!templateRaw) {
      return res.status(400).json({ error: 'template es obligatorio.' });
    }

    if (templateRaw.length > MAX_WHATSAPP_TEMPLATE_LENGTH) {
      return res.status(400).json({ error: `template supera el maximo de ${MAX_WHATSAPP_TEMPLATE_LENGTH} caracteres.` });
    }

    const nowIso = new Date().toISOString();

    const { data: updatedRow, error: updateError } = await supabase
      .from('configuracion_admin')
      .update({ valor: templateRaw, updated_at: nowIso })
      .eq('clave', ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY)
      .select('clave, valor, updated_at')
      .single();

    if (!updateError) {
      return res.status(200).json({
        template: String(updatedRow?.valor || '').trim() || DEFAULT_WHATSAPP_TEMPLATE,
        clave: ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
        updated_at: updatedRow?.updated_at || nowIso,
      });
    }

    if (isMissingRelationError(updateError)) {
      console.error('Falta tabla configuracion_admin para guardar plantilla de WhatsApp:', updateError);
      return res.status(500).json({ error: 'Falta migracion de configuracion_admin en la base de datos.' });
    }

    if (updateError?.code !== 'PGRST116') {
      console.error('Error al actualizar plantilla de WhatsApp:', updateError);
      return res.status(500).json({ error: 'No se pudo guardar la plantilla de WhatsApp.' });
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from('configuracion_admin')
      .insert([
        {
          clave: ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
          valor: templateRaw,
          descripcion: 'Plantilla de mensaje de WhatsApp para gestion de inscripciones',
        },
      ])
      .select('clave, valor, updated_at')
      .single();

    if (insertError) {
      if (isMissingRelationError(insertError)) {
        console.error('Falta tabla configuracion_admin para insertar plantilla de WhatsApp:', insertError);
        return res.status(500).json({ error: 'Falta migracion de configuracion_admin en la base de datos.' });
      }

      console.error('Error al crear plantilla de WhatsApp:', insertError);
      return res.status(500).json({ error: 'No se pudo guardar la plantilla de WhatsApp.' });
    }

    return res.status(200).json({
      template: String(insertedRow?.valor || '').trim() || DEFAULT_WHATSAPP_TEMPLATE,
      clave: ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
      updated_at: insertedRow?.updated_at || nowIso,
    });
  } catch (err) {
    console.error('Error inesperado al guardar plantilla de WhatsApp:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
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

const formatTournamentListItem = (torneo, inscriptionSummary = null) => {
  const inscritosCount = Number(inscriptionSummary?.aprobadas ?? torneo.inscripciones?.[0]?.count ?? 0);
  const pendientesCount = Number(inscriptionSummary?.pendientes ?? 0);
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
    inscritos: inscritosCount,
    inscritos_count: inscritosCount,
    solicitudes_pendientes: pendientesCount,
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
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const {
      titulo,
      costo,
      fecha_inicio,
      fecha_fin,
      fecha_inicio_inscripcion,
      fecha_cierre_inscripcion,
    } = req.body;

    if (
      !titulo ||
      !fecha_inicio ||
      !fecha_fin ||
      !fecha_inicio_inscripcion ||
      !fecha_cierre_inscripcion
    ) {
      return res.status(400).json({
        error: 'Faltan campos obligatorios: titulo, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion.',
      });
    }

    const payload = buildTournamentPayload({
      titulo,
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
    payload.club_id = clubId;

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
      .select('id, titulo, costo, estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion, modalidad, rama, categoria_id, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon')
      .eq('id', id)
      .single();

    if (fetchError || !torneoExistente) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const mergedData = {
      titulo: req.body.titulo !== undefined ? req.body.titulo : torneoExistente.titulo,
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
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const ahora = new Date();

    const { data: torneos, error } = await supabase
      .from('torneos')
      .select(`
        id,
        titulo,
        estado,
        costo,
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
        fecha_cierre_inscripcion
      `)
      .eq('club_id', clubId)
      .order('fecha_inicio', { ascending: true });

    if (error) {
      console.error('Error al obtener torneos disponibles:', error);
      return res.status(500).json({ error: 'Error al listar torneos' });
    }

    const torneoIds = (torneos || []).map((t) => t.id);
    const { summaryByTournament, error: summaryError } = await fetchTournamentInscriptionSummaryCompat(torneoIds, clubId);
    if (summaryError) {
      console.error('Error al obtener resumen de inscripciones por torneo:', summaryError);
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
        const summary = summaryByTournament.get(String(t.id || '').trim()) || { aprobadas: 0, pendientes: 0 };
        const inscritos = Number(summary.aprobadas || 0);

        return {
          ...formatTournamentListItem(t, summary),
          disponible: true, // inscripciones ilimitadas hasta fecha de cierre
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
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const { data: torneos, error } = await supabase
      .from('torneos')
      .select(`
        id,
        titulo,
        estado,
        costo,
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
        fecha_cierre_inscripcion
      `)
      .eq('club_id', clubId)
      .order('fecha_inicio', { ascending: false });

    if (error) {
      console.error('Error al obtener todos los torneos:', error);
      return res.status(500).json({ error: 'Error al listar torneos' });
    }

    const torneoIds = (torneos || []).map((t) => t.id);
    const { summaryByTournament, error: summaryError } = await fetchTournamentInscriptionSummaryCompat(torneoIds, clubId);
    if (summaryError) {
      console.error('Error al obtener resumen de inscripciones por torneo:', summaryError);
      return res.status(500).json({ error: 'Error al listar torneos' });
    }

    const torneosFormateados = (torneos || []).map((t) => {
      const summary = summaryByTournament.get(String(t.id || '').trim()) || { aprobadas: 0, pendientes: 0 };
      const item = formatTournamentListItem(t, summary);
      return {
        ...item,
        disponible: true, // inscripciones ilimitadas hasta fecha de cierre
      };
    });

    res.json(torneosFormateados);
  } catch (err) {
    console.error('Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const listarCompanerosDoblesDisponibles = async (req, res) => {
  try {
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const torneoId = String(req.params?.torneoId || req.params?.id || '').trim();
    const jugadorBaseId = normalizeQueryText(req.query?.jugador_id || req.authUser?.id);
    const q = normalizeQueryText(req.query?.q);

    if (!UUID_REGEX.test(torneoId)) {
      return res.status(400).json({ error: 'torneoId invalido.' });
    }

    if (!UUID_REGEX.test(jugadorBaseId)) {
      return res.status(400).json({ error: 'jugador_id invalido.' });
    }

    const { data: torneo, error: torneoError } = await supabase
      .from('torneos')
      .select('id, modalidad, rama, categoria_id')
      .eq('id', torneoId)
      .eq('club_id', clubId)
      .single();

    if (torneoError || !torneo) {
      return res.status(404).json({ error: 'Torneo no encontrado.' });
    }

    if (!isDoblesModalidad(torneo.modalidad)) {
      return res.status(200).json([]);
    }

    const modalidadTorneo = normalizeModalidad(torneo.modalidad);
    const ramaTorneo = normalizeRama(torneo.rama);
    const categoriaTorneo = parseCategoria(torneo.categoria_id);

    const { data: perfilBase, error: perfilBaseError } = await fetchPerfilCompat(jugadorBaseId, clubId);
    if (perfilBaseError || !perfilBase) {
      return res.status(404).json({ error: 'Perfil del jugador base no encontrado.' });
    }

    const categoriaBase = resolveCategoriaPerfilPorModalidad(perfilBase, modalidadTorneo);
    const sexoBase = normalizeRama(perfilBase.sexo);

    let candidatosQuery = supabase
      .from('perfiles')
      .select('id, nombre_completo, sexo, categoria, categoria_singles, categoria_dobles')
      .eq('club_id', clubId)
      .neq('id', jugadorBaseId)
      .order('nombre_completo', { ascending: true })
      .limit(25);

    if (q) {
      candidatosQuery = candidatosQuery.ilike('nombre_completo', `%${q}%`);
    }

    const { data: candidatosRaw, error: candidatosError } = await candidatosQuery;
    if (candidatosError) {
      console.error('Error al buscar companeros de dobles:', candidatosError);
      return res.status(500).json({ error: 'No se pudieron buscar companeros.' });
    }

    const { data: inscripcionesRaw, error: inscripcionesError } = await supabase
      .from('inscripciones')
      .select('jugador_id')
      .eq('torneo_id', torneoId)
      .eq('club_id', clubId);

    if (inscripcionesError) {
      console.error('Error al listar inscripciones para filtrar companeros:', inscripcionesError);
      return res.status(500).json({ error: 'No se pudo validar la disponibilidad de companeros.' });
    }

    const inscritosSet = new Set((inscripcionesRaw || []).map((row) => String(row?.jugador_id || '').trim()).filter(Boolean));
    inscritosSet.add(jugadorBaseId);

    const candidatos = (candidatosRaw || []).filter((perfil) => {
      if (!perfil?.id || inscritosSet.has(String(perfil.id).trim())) {
        return false;
      }

      const sexoPerfil = normalizeRama(perfil.sexo);
      const categoriaPerfil = resolveCategoriaPerfilPorModalidad(perfil, modalidadTorneo);

      if (!sexoPerfil || categoriaPerfil === null) {
        return false;
      }

      if (categoriaTorneo !== null && categoriaPerfil !== categoriaTorneo) {
        return false;
      }

      if (categoriaBase !== null && categoriaPerfil !== categoriaBase) {
        return false;
      }

      if (ramaTorneo === 'Masculino' && sexoPerfil !== 'Masculino') {
        return false;
      }

      if (ramaTorneo === 'Femenino' && sexoPerfil !== 'Femenino') {
        return false;
      }

      if (ramaTorneo === 'Mixto' && sexoBase && !areOppositeSexes(sexoBase, sexoPerfil)) {
        return false;
      }

      return true;
    });

    return res.status(200).json(candidatos);
  } catch (err) {
    console.error('Error inesperado al listar companeros de dobles:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const inscribirJugador = async (req, res) => {
  try {
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const torneo_id = req.params.torneoId || req.params.id;
    const { jugador_id, pareja_jugador_id, disponibilidad_inscripcion, disponibilidad } = req.body;
    const parejaJugadorId = normalizeQueryText(pareja_jugador_id);
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
      .select('estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion, modalidad, rama, categoria_id')
      .eq('id', torneo_id)
      .eq('club_id', clubId)
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

    const { data: perfilJugador, error: perfilError } = await fetchPerfilCompat(jugador_id, clubId);
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

    const torneoEsDobles = isDoblesModalidad(modalidadTorneo);

    if (torneoEsDobles) {
      if (!parejaJugadorId) {
        return res.status(400).json({ error: 'En torneos de dobles debes indicar pareja_jugador_id.' });
      }

      if (!UUID_REGEX.test(parejaJugadorId)) {
        return res.status(400).json({ error: 'pareja_jugador_id debe ser un UUID valido.' });
      }

      if (String(jugador_id).trim() === parejaJugadorId) {
        return res.status(400).json({ error: 'No puedes inscribirte contigo mismo como pareja.' });
      }

      const { data: perfilParejaRaw, error: perfilParejaError } = await fetchPerfilCompat(parejaJugadorId, clubId);
      if (perfilParejaError || !perfilParejaRaw) {
        return res.status(404).json({ error: 'El perfil de la pareja no fue encontrado en este club.' });
      }

      const sexoPareja = normalizeRama(perfilParejaRaw.sexo);
      const categoriaPareja = resolveCategoriaPerfilPorModalidad(perfilParejaRaw, modalidadTorneo);

      if (!sexoPareja || categoriaPareja === null) {
        return res.status(409).json({
          error: 'El perfil de la pareja no tiene sexo/categoria configurados para esta modalidad.',
        });
      }

      if (categoriaPareja !== categoriaTorneo || categoriaPareja !== categoriaJugador) {
        return res.status(409).json({
          error: 'La pareja debe coincidir con la misma categoria del torneo y del jugador titular.',
        });
      }

      if (ramaTorneo === 'Masculino' && sexoPareja !== 'Masculino') {
        return res.status(409).json({ error: 'La pareja no cumple con la rama Masculino del torneo.' });
      }

      if (ramaTorneo === 'Femenino' && sexoPareja !== 'Femenino') {
        return res.status(409).json({ error: 'La pareja no cumple con la rama Femenino del torneo.' });
      }

      if (ramaTorneo === 'Mixto' && !areOppositeSexes(sexoJugador, sexoPareja)) {
        return res.status(409).json({ error: 'En dobles mixto la pareja debe estar compuesta por un Masculino y un Femenino.' });
      }
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

    const { data: inscripcionExistente, error: existingFetchError } = await fetchInscripcionByTournamentPlayerCompat({
      torneoId: torneo_id,
      jugadorId: jugador_id,
      clubId,
    });

    if (existingFetchError) {
      console.error('Error al verificar inscripcion existente:', existingFetchError);
      return res.status(500).json({ error: 'Error al procesar la inscripción' });
    }

    if (inscripcionExistente) {
      const estadoExistente = resolveInscriptionStatusCompat(inscripcionExistente);

      if (estadoExistente === INSCRIPTION_STATUS_PENDING) {
        return res.status(409).json({ error: 'Ya tienes una solicitud pendiente de aprobación para este torneo.' });
      }

      if (estadoExistente === INSCRIPTION_STATUS_APPROVED) {
        return res.status(409).json({ error: 'Tu inscripción ya fue aprobada para este torneo.' });
      }

      if (estadoExistente === INSCRIPTION_STATUS_REJECTED) {
        return res.status(409).json({ error: 'Tu solicitud anterior fue rechazada. Contacta a un administrador para volver a postularte.' });
      }

      return res.status(409).json({ error: 'El jugador ya tiene una inscripción asociada a este torneo.' });
    }

    if (torneoEsDobles) {
      const { data: inscripcionParejaExistente, error: inscripcionParejaError } = await fetchInscripcionByTournamentPlayerCompat({
        torneoId: torneo_id,
        jugadorId: parejaJugadorId,
        clubId,
      });

      if (inscripcionParejaError) {
        console.error('Error al verificar inscripción de la pareja:', inscripcionParejaError);
        return res.status(500).json({ error: 'No se pudo verificar la disponibilidad de la pareja.' });
      }

      if (inscripcionParejaExistente) {
        return res.status(409).json({ error: 'La pareja seleccionada ya tiene una inscripción para este torneo.' });
      }
    }

    const parejaId = torneoEsDobles ? randomUUID() : null;
    const buildPayloadWithStatus = (jugadorId, parejaJugadorIdValue = null) => ({
      club_id: clubId,
      torneo_id,
      jugador_id: jugadorId,
      pareja_id: parejaId,
      pareja_jugador_id: parejaJugadorIdValue,
      estado: mapLegacyStateFromInscriptionStatus(INSCRIPTION_STATUS_PENDING),
      estado_inscripcion: INSCRIPTION_STATUS_PENDING,
      pago_confirmado: false,
      fecha_validacion: null,
      motivo_rechazo: null,
    });

    const buildPayloadLegacy = (jugadorId, parejaJugadorIdValue = null) => ({
      club_id: clubId,
      torneo_id,
      jugador_id: jugadorId,
      pareja_id: parejaId,
      pareja_jugador_id: parejaJugadorIdValue,
      estado: mapLegacyStateFromInscriptionStatus(INSCRIPTION_STATUS_PENDING),
      pago_confirmado: false,
    });

    const payloadRowsWithStatus = torneoEsDobles
      ? [
        buildPayloadWithStatus(jugador_id, parejaJugadorId),
        buildPayloadWithStatus(parejaJugadorId, jugador_id),
      ]
      : [buildPayloadWithStatus(jugador_id)];

    const payloadRowsLegacy = torneoEsDobles
      ? [
        buildPayloadLegacy(jugador_id, parejaJugadorId),
        buildPayloadLegacy(parejaJugadorId, jugador_id),
      ]
      : [buildPayloadLegacy(jugador_id)];

    const insertAttempts = [payloadRowsWithStatus, payloadRowsLegacy];
    let inscripcionesCreadas = [];
    let insertErrorFinal = null;

    for (let idx = 0; idx < insertAttempts.length; idx += 1) {
      const rowsPayload = insertAttempts[idx];
      const { data, error } = await supabase
        .from('inscripciones')
        .insert(rowsPayload)
        .select();

      if (!error) {
        inscripcionesCreadas = data || [];
        insertErrorFinal = null;
        break;
      }

      insertErrorFinal = error;

      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una solicitud o inscripción para alguno de los jugadores de la pareja.' });
      }

      if (!isMissingColumnError(error) || idx === insertAttempts.length - 1) {
        break;
      }
    }

    if (insertErrorFinal) {
      if (torneoEsDobles && isMissingColumnError(insertErrorFinal)) {
        return res.status(409).json({
          error: 'Tu base de datos todavia no soporta inscripción por pareja en dobles. Ejecuta migration_v28.sql.',
        });
      }

      console.error('Error al inscribir:', insertErrorFinal);
      return res.status(500).json({ error: 'Error al procesar la inscripción' });
    }

    const jugadoresDisponibilidad = torneoEsDobles ? [jugador_id, parejaJugadorId] : [jugador_id];
    const { error: deleteDispError } = await supabase
      .from('disponibilidad_inscripcion')
      .delete()
      .eq('torneo_id', torneo_id)
      .in('jugador_id', jugadoresDisponibilidad);

    if (deleteDispError) {
      const inscriptionIds = (inscripcionesCreadas || []).map((item) => item.id).filter(Boolean);
      if (inscriptionIds.length > 0) {
        await supabase.from('inscripciones').delete().in('id', inscriptionIds);
      }

      console.error('Error al limpiar disponibilidad de inscripcion previa:', deleteDispError);
      return res.status(500).json({ error: 'Error al guardar la disponibilidad de inscripcion.' });
    }

    const disponibilidadBase = jugadoresDisponibilidad.flatMap((jugadorIdActual) => (
      franjasNormalizadas.map((franja) => ({
        ...franja,
        jugador_id: jugadorIdActual,
      }))
    ));

    const disponibilidadInsertAttempts = [
      disponibilidadBase,
      disponibilidadBase.map(({ es_obligatoria_fin_semana, ...resto }) => resto),
    ];

    let dispInsertError = null;
    for (let idx = 0; idx < disponibilidadInsertAttempts.length; idx += 1) {
      const payload = disponibilidadInsertAttempts[idx];
      const { error } = await supabase
        .from('disponibilidad_inscripcion')
        .insert(payload);

      if (!error) {
        dispInsertError = null;
        break;
      }

      dispInsertError = error;
      if (!isMissingColumnError(error) || idx === disponibilidadInsertAttempts.length - 1) {
        break;
      }
    }

    if (dispInsertError) {
      const inscriptionIds = (inscripcionesCreadas || []).map((item) => item.id).filter(Boolean);
      if (inscriptionIds.length > 0) {
        await supabase.from('inscripciones').delete().in('id', inscriptionIds);
      }

      console.error('Error al guardar disponibilidad de inscripcion:', dispInsertError);
      return res.status(500).json({ error: 'Error al guardar la disponibilidad de inscripcion.' });
    }

    emitPendingInscriptionsUpdated({
      tipo: 'nueva_solicitud',
      torneo_id,
      jugador_id,
      pareja_jugador_id: torneoEsDobles ? parejaJugadorId : null,
    });

    const primeraInscripcion = Array.isArray(inscripcionesCreadas) && inscripcionesCreadas.length > 0
      ? inscripcionesCreadas[0]
      : null;

    res.status(201).json({
      message: torneoEsDobles
        ? 'La solicitud de la pareja fue enviada y esta siendo revisada por el administrador.'
        : 'Tu solicitud fue enviada. Tu inscripción está siendo revisada por el administrador.',
      inscripcion: primeraInscripcion,
      inscripciones: inscripcionesCreadas,
      estado: mapLegacyStateFromInscriptionStatus(INSCRIPTION_STATUS_PENDING),
      estado_inscripcion: INSCRIPTION_STATUS_PENDING,
      disponibilidad_guardada: disponibilidadBase.length,
      pareja_jugador_id: torneoEsDobles ? parejaJugadorId : null,
      pareja_id: torneoEsDobles ? parejaId : null,
    });

  } catch (err) {
    console.error('Error inesperado en inscripción:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtenerInscripcionesPendientesAdmin = async (req, res) => {
  try {
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const selectOptions = [
      'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, fecha_validacion, motivo_rechazo, torneos(id, titulo, modalidad, rama, categoria_id), jugador_perfil:perfiles!inscripciones_jugador_id_fkey(id, nombre_completo, telefono), pareja_perfil:perfiles!inscripciones_pareja_jugador_fk(id, nombre_completo, telefono)',
      'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, torneos(id, titulo, modalidad, rama, categoria_id), jugador_perfil:perfiles!inscripciones_jugador_id_fkey(id, nombre_completo, telefono), pareja_perfil:perfiles!inscripciones_pareja_jugador_fk(id, nombre_completo, telefono)',
      'id, torneo_id, jugador_id, estado, fecha_inscripcion, torneos(id, titulo, modalidad, rama, categoria_id), jugador_perfil:perfiles!inscripciones_jugador_id_fkey(id, nombre_completo, telefono)',
      // Fallback sin FK con nombre: funciona aunque el cache de schema no tenga los constraints
      'id, torneo_id, jugador_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, fecha_validacion, motivo_rechazo, torneos(id, titulo, modalidad, rama, categoria_id)',
    ];

    let pendingRows = [];
    let fetchError = null;

    for (const columns of selectOptions) {
      const query = supabase
        .from('inscripciones')
        .select(columns)
        .eq('club_id', clubId)
        .order('fecha_inscripcion', { ascending: true });

      const usesNewStatusColumn = columns.includes('estado_inscripcion');
      let filteredQuery;
      if (usesNewStatusColumn) {
        filteredQuery = query.eq('estado_inscripcion', INSCRIPTION_STATUS_PENDING);
      } else {
        filteredQuery = query.in('estado', ['pendiente', 'pendiente_revision', 'lista_espera']);
      }

      const { data, error } = await filteredQuery;
      if (!error) {
        pendingRows = data || [];
        fetchError = null;
        break;
      }

      fetchError = error;
      if (!isMissingColumnError(error) && !isMissingRelationError(error)) {
        break;
      }
    }

    if (fetchError) {
      console.error('Error al obtener inscripciones pendientes:', fetchError);
      return res.status(500).json({ error: 'No se pudieron cargar las inscripciones pendientes.' });
    }

    const pendientes = (pendingRows || [])
      .map((item) => {
        const torneo = Array.isArray(item?.torneos) ? item.torneos[0] : item?.torneos;
        const jugador = Array.isArray(item?.jugador_perfil) ? item.jugador_perfil[0] : item?.jugador_perfil;
        const pareja = Array.isArray(item?.pareja_perfil) ? item.pareja_perfil[0] : item?.pareja_perfil;

        return {
          id: item.id,
          torneo_id: item.torneo_id,
          jugador_id: item.jugador_id,
          pareja_id: item.pareja_id ?? null,
          pareja_jugador_id: item.pareja_jugador_id ?? null,
          estado: item.estado ?? null,
          estado_inscripcion: resolveInscriptionStatusCompat(item) || INSCRIPTION_STATUS_PENDING,
          fecha_inscripcion: item.fecha_inscripcion ?? null,
          fecha_validacion: item.fecha_validacion ?? null,
          motivo_rechazo: item.motivo_rechazo ?? null,
          torneo: torneo || null,
          jugador: jugador || null,
          pareja: pareja || null,
        };
      })
      .filter((item) => item.estado_inscripcion === INSCRIPTION_STATUS_PENDING);

    return res.status(200).json(pendientes);
  } catch (err) {
    console.error('Error inesperado al listar pendientes:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const validarInscripcionAdmin = async (req, res) => {
  try {
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const inscripcionId = String(req.params?.inscripcionId || '').trim();
    const estadoObjetivo = normalizeInscriptionStatus(req.body?.estado_inscripcion ?? req.body?.estado);
    const motivoRaw = typeof req.body?.motivo_rechazo === 'string' ? req.body.motivo_rechazo.trim() : '';

    if (!UUID_REGEX.test(inscripcionId)) {
      return res.status(400).json({ error: 'El id de inscripción es inválido.' });
    }

    if (![INSCRIPTION_STATUS_APPROVED, INSCRIPTION_STATUS_REJECTED].includes(estadoObjetivo)) {
      return res.status(400).json({ error: 'estado_inscripcion debe ser aprobada o rechazada.' });
    }

    const selectOptions = [
      'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion, torneos(titulo)',
      'id, torneo_id, jugador_id, estado, estado_inscripcion, torneos(titulo)',
      'id, torneo_id, jugador_id, estado, torneos(titulo)',
    ];

    let fetchError = null;
    let inscripcion = null;

    for (const columns of selectOptions) {
      const { data, error } = await supabase
        .from('inscripciones')
        .select(columns)
        .eq('id', inscripcionId)
        .eq('club_id', clubId)
        .single();

      if (!error) {
        inscripcion = data;
        fetchError = null;
        break;
      }

      fetchError = error;
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ error: 'Inscripción no encontrada.' });
      }

      if (!isMissingColumnError(error)) {
        break;
      }
    }

    if (fetchError) {
      console.error('Error al obtener inscripción para validar:', fetchError);
      return res.status(500).json({ error: 'No se pudo validar la inscripción.' });
    }

    const estadoActual = resolveInscriptionStatusCompat(inscripcion);
    if (estadoActual === estadoObjetivo) {
      return res.status(200).json({
        message: `La inscripción ya estaba ${estadoObjetivo}.`,
        inscripcion: {
          ...inscripcion,
          estado_inscripcion: estadoObjetivo,
        },
      });
    }

    if (estadoActual !== INSCRIPTION_STATUS_PENDING) {
      return res.status(409).json({
        error: 'Solo se pueden validar o rechazar solicitudes pendientes.',
      });
    }

    // Inscripciones ilimitadas: se suprime el chequeo de cupos_max.

    const basePayload = {
      estado: mapLegacyStateFromInscriptionStatus(estadoObjetivo),
      pago_confirmado: estadoObjetivo === INSCRIPTION_STATUS_APPROVED,
    };

    const payloadWithStatus = {
      ...basePayload,
      estado_inscripcion: estadoObjetivo,
      fecha_validacion: new Date().toISOString(),
      motivo_rechazo: estadoObjetivo === INSCRIPTION_STATUS_REJECTED
        ? (motivoRaw || null)
        : null,
    };

    const payloadLegacy = {
      ...basePayload,
    };

    const updateAttempts = [payloadWithStatus, payloadLegacy];
    let updateError = null;
    let updatedRows = [];
    const shouldUpdatePair = Boolean(inscripcion?.pareja_id);

    for (let idx = 0; idx < updateAttempts.length; idx += 1) {
      const payload = updateAttempts[idx];
      let query = supabase
        .from('inscripciones')
        .update(payload)
        .select();

      if (shouldUpdatePair) {
        query = query
          .eq('torneo_id', inscripcion.torneo_id)
          .eq('pareja_id', inscripcion.pareja_id)
          .eq('club_id', clubId);
      } else {
        query = query.eq('id', inscripcionId);
      }

      const { data, error } = await query;

      if (!error) {
        updatedRows = Array.isArray(data) ? data : (data ? [data] : []);
        updateError = null;
        break;
      }

      updateError = error;
      if (!isMissingColumnError(error) || idx === updateAttempts.length - 1) {
        break;
      }
    }

    if (updateError) {
      console.error('Error al actualizar inscripción:', updateError);
      return res.status(500).json({ error: 'No se pudo actualizar el estado de la inscripción.' });
    }

    emitPendingInscriptionsUpdated({
      tipo: 'resolucion_solicitud',
      torneo_id: inscripcion.torneo_id,
      jugador_id: inscripcion.jugador_id,
      pareja_jugador_id: inscripcion?.pareja_jugador_id || null,
      estado_inscripcion: estadoObjetivo,
    });

    const updatedPrincipal = updatedRows.find((row) => String(row?.jugador_id || '').trim() === String(inscripcion.jugador_id || '').trim())
      || updatedRows[0]
      || null;

    return res.status(200).json({
      message: estadoObjetivo === INSCRIPTION_STATUS_APPROVED
        ? 'Inscripción aprobada correctamente.'
        : 'Inscripción rechazada correctamente.',
      inscripcion: {
        ...updatedPrincipal,
        estado_inscripcion: estadoObjetivo,
      },
      inscripciones_actualizadas: updatedRows,
    });
  } catch (err) {
    console.error('Error inesperado al validar inscripción:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const obtenerInscripcionesPorJugador = async (req, res) => {
  try {
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const jugadorId = String(req.params?.id || '').trim();

    if (!UUID_REGEX.test(jugadorId)) {
      return res.status(400).json({ error: 'El jugador_id es invalido.' });
    }

    const selectOptions = [
      'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, fecha_validacion, motivo_rechazo',
      'id, torneo_id, jugador_id, estado, estado_inscripcion, fecha_inscripcion',
      'id, torneo_id, jugador_id, estado, fecha_inscripcion',
    ];

    let fetchError = null;
    let rows = [];
    for (const columns of selectOptions) {
      const { data, error } = await supabase
        .from('inscripciones')
        .select(columns)
        .eq('jugador_id', jugadorId)
        .eq('club_id', clubId)
        .order('fecha_inscripcion', { ascending: false });

      if (!error) {
        rows = data || [];
        fetchError = null;
        break;
      }

      fetchError = error;
      if (!isMissingColumnError(error)) {
        break;
      }
    }

    if (fetchError) {
      console.error('Error al listar inscripciones del jugador:', fetchError);
      return res.status(500).json({ error: 'No se pudieron listar las inscripciones del jugador.' });
    }

    const response = (rows || []).map((row) => ({
      id: row.id,
      torneo_id: row.torneo_id,
      jugador_id: row.jugador_id,
      pareja_id: row.pareja_id ?? null,
      pareja_jugador_id: row.pareja_jugador_id ?? null,
      estado: row.estado ?? null,
      estado_inscripcion: resolveInscriptionStatusCompat(row),
      fecha_inscripcion: row.fecha_inscripcion ?? null,
      fecha_validacion: row.fecha_validacion ?? null,
      motivo_rechazo: row.motivo_rechazo ?? null,
    }));

    return res.status(200).json(response);
  } catch (err) {
    console.error('Error inesperado al listar inscripciones por jugador:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
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
  getInscripcionesWhatsappTemplate,
  updateInscripcionesWhatsappTemplate,
  listarCompanerosDoblesDisponibles,
  inscribirJugador,
  obtenerInscripcionesPendientesAdmin,
  validarInscripcionAdmin,
  obtenerInscripcionesPorJugador,
  obtenerCanchasDelTorneo,
  obtenerEstadoCanchas,
  actualizarEstadoTorneo,
};
