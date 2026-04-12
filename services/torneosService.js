'use strict';

/**
 * services/torneosService.js
 *
 * Lógica de negocio completa para torneos e inscripciones.
 * Sin acceso a req/res — eso es responsabilidad del controller.
 */

const { randomUUID } = require('crypto');
const supabase = require('./supabase');
const { getPlanConfig } = require('./planConfig');
const logger  = require('./logger');
const metrics = require('../utils/metrics');
const cache   = require('../utils/cache');
const { invalidateClub } = require('../utils/cacheInvalidation');
const {
  ValidationError, NotFoundError, ConflictError, ForbiddenError,
  InternalError, AuthError,
} = require('../utils/errors');

// ─── Constantes ───────────────────────────────────────────────────────────────

const INSCRIPTION_STATUS_PENDING          = 'pendiente';
const INSCRIPTION_STATUS_APPROVED         = 'aprobada';
const INSCRIPTION_STATUS_REJECTED         = 'rechazada';
const INSCRIPTION_STATUS_WITHDRAWAL_PENDING = 'pendiente_baja';

const VALID_TOURNAMENT_STATES = new Set([
  'borrador', 'publicado', 'abierto', 'en_progreso', 'finalizado', 'cancelado',
]);
const INSCRIBIBLE_STATES = new Set(['publicado', 'abierto']);
const NON_AVAILABLE_STATES = new Set(['en_progreso', 'finalizado', 'cancelado']);
const VALID_MODALIDADES   = new Set(['Singles', 'Dobles']);
const VALID_RAMAS         = new Set(['Masculino', 'Femenino', 'Mixto']);
const DEFAULT_INSCRIBIBLE_STATE = 'publicado';

const ROUND_POINT_ORDERS = [32, 16, 8, 4, 2];
const DEFAULT_POINTS_BY_ROUND = { 32: 5, 16: 10, 8: 20, 4: 40, 2: 80 };
const DEFAULT_CHAMPION_POINTS = 100;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY  = 'whatsapp_inscripcion_template';
const DEFAULT_WHATSAPP_TEMPLATE           = '¡Hola! Tu inscripción al torneo fue recibida. En breve nos comunicamos.';
const MAX_WHATSAPP_TEMPLATE_LENGTH        = 1000;

// ─── Helpers de compatibilidad ────────────────────────────────────────────────

const isMissingColumnError = (error) => {
  const code    = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '');
  if (code === '42703' || code === 'PGRST204') return true;
  if (/column .* does not exist/i.test(message)) return true;
  if (/could not find the '.*' column/i.test(message)) return true;
  return /schema cache/i.test(message) && /column/i.test(message);
};

const isMissingRelationError = (error) => {
  const code    = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '');
  if (code === '42P01' || code === 'PGRST200' || code === 'PGRST205') return true;
  if (/relation .* does not exist/i.test(message)) return true;
  if (/could not find a relationship/i.test(message)) return true;
  return /could not find the table/i.test(message) || (/schema cache/i.test(message) && /table/i.test(message));
};

const normalizeInscriptionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'approved' || normalized === 'aprobar') return INSCRIPTION_STATUS_APPROVED;
  if (normalized === INSCRIPTION_STATUS_PENDING) return INSCRIPTION_STATUS_PENDING;
  if (normalized === INSCRIPTION_STATUS_REJECTED) return INSCRIPTION_STATUS_REJECTED;
  if (normalized === INSCRIPTION_STATUS_WITHDRAWAL_PENDING) return INSCRIPTION_STATUS_WITHDRAWAL_PENDING;
  return normalized;
};

const normalizeLegacyInscriptionState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'confirmada') return 'confirmada';
  if (['lista_espera', 'pendiente', 'pendiente_revision'].includes(normalized)) return 'pendiente';
  if (['cancelada', 'rechazada'].includes(normalized)) return 'rechazada';
  return normalized;
};

const resolveInscriptionStatusCompat = (row = {}) => {
  const fromNewColumn = normalizeInscriptionStatus(row.estado_inscripcion);
  if (fromNewColumn) return fromNewColumn;
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
  for (const row of (rows || [])) {
    const torneoId = String(row?.torneo_id || '').trim();
    if (!torneoId) continue;
    if (!summaryByTournament.has(torneoId)) {
      summaryByTournament.set(torneoId, { aprobadas: 0, pendientes: 0, rechazadas: 0 });
    }
    const current = summaryByTournament.get(torneoId);
    const status  = resolveInscriptionStatusCompat(row);
    if (status === INSCRIPTION_STATUS_APPROVED)  current.aprobadas  += 1;
    if (status === INSCRIPTION_STATUS_PENDING)   current.pendientes += 1;
    if (status === INSCRIPTION_STATUS_REJECTED)  current.rechazadas += 1;
  }
  return summaryByTournament;
};

const fetchInscriptionRowsByTournamentIdsCompat = async (torneoIds = [], clubId) => {
  const normalizedIds = [...new Set((torneoIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalizedIds.length) return { data: [], error: null };

  const selectOptions = ['torneo_id, estado, estado_inscripcion', 'torneo_id, estado'];
  let lastError = null;

  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones')
      .select(columns)
      .eq('club_id', clubId)
      .in('torneo_id', normalizedIds);

    if (!error) return { data: data || [], error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { data: [], error: lastError };
};

const fetchTournamentInscriptionSummaryCompat = async (torneoIds = [], clubId) => {
  const { data, error } = await fetchInscriptionRowsByTournamentIdsCompat(torneoIds, clubId);
  if (error) return { summaryByTournament: new Map(), error };
  return {
    summaryByTournament: aggregateInscriptionSummaryByTournamentId(data || []),
    error: null,
  };
};

const emitPendingInscriptionsUpdated = (payload = {}) => {
  try {
    const io = global.__tennisflow_io;
    if (!io || typeof io.emit !== 'function') return;
    io.emit('inscripciones_pendientes_actualizadas', { ts: new Date().toISOString(), ...payload });
  } catch (_) { /* no-op */ }
};

const parseNonNegativeInteger = (value) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
};

const normalizePointsByRound = (body = {}) => {
  const nested = body.puntos_por_ronda && typeof body.puntos_por_ronda === 'object'
    ? body.puntos_por_ronda : {};
  const pointsByRound = {};
  for (const roundOrder of ROUND_POINT_ORDERS) {
    const raw = body[`puntos_ronda_${roundOrder}`] ?? nested[String(roundOrder)];
    if (raw === undefined || raw === null || raw === '') {
      pointsByRound[roundOrder] = DEFAULT_POINTS_BY_ROUND[roundOrder] || 0;
      continue;
    }
    const parsed = parseNonNegativeInteger(raw);
    if (parsed === null) return { error: `puntos_ronda_${roundOrder} debe ser un entero mayor o igual a 0.` };
    pointsByRound[roundOrder] = parsed;
  }
  return { data: pointsByRound, error: null };
};

const normalizeChampionPoints = (body = {}, pointsByRound = {}) => {
  const nested = body.puntos_por_ronda && typeof body.puntos_por_ronda === 'object'
    ? body.puntos_por_ronda : {};
  const raw = body.puntos_campeon ?? body.puntos_ronda_1 ?? nested.campeon ?? nested.champion ?? nested['1'];
  if (raw === undefined || raw === null || raw === '') {
    const fallback = parseNonNegativeInteger(pointsByRound[2]);
    return fallback !== null ? { data: fallback, error: null } : { data: DEFAULT_CHAMPION_POINTS, error: null };
  }
  const parsed = parseNonNegativeInteger(raw);
  if (parsed === null) return { error: 'puntos_campeon debe ser un entero mayor o igual a 0.' };
  return { data: parsed, error: null };
};

const normalizeModalidad = (value) => {
  if (typeof value !== 'string') return null;
  const n = value.trim().toLowerCase();
  if (n === 'single' || n === 'singles') return 'Singles';
  if (n === 'double' || n === 'dobles' || n === 'doubles') return 'Dobles';
  return null;
};

const normalizeRama = (value) => {
  if (typeof value !== 'string') return null;
  const n = value.trim().toLowerCase();
  if (n === 'masculino' || n === 'm') return 'Masculino';
  if (n === 'femenino'  || n === 'f') return 'Femenino';
  if (n === 'mixto' || n === 'mixed' || n === 'x') return 'Mixto';
  return null;
};

const parseCategoria = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const c = Number.parseInt(String(value), 10);
  if (!Number.isInteger(c) || c < 1 || c > 5) return null;
  return c;
};

const resolveCategoriaPerfilPorModalidad = (perfil, modalidad) => {
  if (!perfil) return null;
  return modalidad === 'Dobles'
    ? parseCategoria(perfil.categoria_dobles ?? perfil.categoria)
    : parseCategoria(perfil.categoria_singles ?? perfil.categoria);
};

const fetchPerfilCompat = async (jugadorId, clubId) => {
  const selectOptions = [
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
  for (const cols of selectOptions) {
    const { data, error } = await supabase
      .from('perfiles').select(cols).eq('id', jugadorId).eq('club_id', clubId).single();
    if (!error && data) return { data, error: null };
    lastError = error;
    const isMissing = error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
    if (!isMissing) break;
  }
  return { data: null, error: lastError };
};

const normalizeTournamentState = (value) => {
  if (typeof value !== 'string') return value;
  const n = value.trim().toLowerCase();
  const aliasMap = {
    inscripcion: 'publicado', abierto_inscripcion: 'abierto', activo: 'en_progreso',
    active: 'en_progreso', en_curso: 'en_progreso', 'en curso': 'en_progreso',
    in_progress: 'en_progreso', started: 'en_progreso', programado: 'en_progreso',
    scheduled: 'en_progreso', terminado: 'finalizado', finished: 'finalizado',
    cancelled: 'cancelado',
  };
  return aliasMap[n] || n;
};

const isValidTournamentState = (value) =>
  typeof value === 'string' && VALID_TOURNAMENT_STATES.has(value);

const parseDateSafe = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toUtcDateOnly = (value) => {
  const parsed = parseDateSafe(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const toDateOnlyString = (value) => {
  const parsed = toUtcDateOnly(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
};

const parseTimeToMinutes = (timeValue) => {
  if (typeof timeValue !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(timeValue.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const isDoblesModalidad = (modalidad) => normalizeModalidad(modalidad) === 'Dobles';

const fetchInscripcionByTournamentPlayerCompat = async ({ torneoId, jugadorId, clubId }) => {
  const selectOptions = [
    'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion',
    'id, torneo_id, jugador_id, estado, estado_inscripcion',
    'id, torneo_id, jugador_id, estado',
  ];
  let lastError = null;
  for (const cols of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones').select(cols)
      .eq('torneo_id', torneoId).eq('jugador_id', jugadorId).eq('club_id', clubId).single();
    if (!error) return { data, error: null };
    if (error?.code === 'PGRST116') return { data: null, error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  return { data: null, error: lastError };
};

const areOppositeSexes = (sexoA, sexoB) => {
  if (!sexoA || !sexoB) return false;
  return (sexoA === 'Masculino' && sexoB === 'Femenino') ||
         (sexoA === 'Femenino' && sexoB === 'Masculino');
};

const normalizeAssignedCanchas = (body) => {
  const hasCA = body.canchas_asignadas !== undefined;
  const hasCI = body.canchas_ids !== undefined;
  if (!hasCA && !hasCI) return { ids: [] };

  const sources = [];
  if (hasCA) {
    if (!Array.isArray(body.canchas_asignadas)) return { error: 'canchas_asignadas debe ser un arreglo de ids.' };
    sources.push(...body.canchas_asignadas);
  }
  if (hasCI) {
    if (!Array.isArray(body.canchas_ids)) return { error: 'canchas_ids debe ser un arreglo de ids.' };
    sources.push(...body.canchas_ids);
  }

  const deduplicated = [...new Set(sources.map((id) =>
    typeof id === 'string' ? id.trim() : String(id || '').trim(),
  ).filter(Boolean))];

  const invalidId = deduplicated.find((id) => !UUID_REGEX.test(id));
  if (invalidId) return { error: `El id de cancha ${invalidId} no es un UUID valido.` };

  return { ids: deduplicated };
};

const validateAssignedCanchas = async (canchaIds) => {
  if (!canchaIds || !canchaIds.length) return { ok: true, canchas: [] };

  const { data, error } = await supabase
    .from('canchas').select('id, esta_disponible').in('id', canchaIds);

  if (error) return { ok: false, status: 500, error: 'Error al validar canchas asignadas.', details: error.message };

  const canchas   = data || [];
  const foundIds  = new Set(canchas.map((c) => c.id));
  const missingIds = canchaIds.filter((id) => !foundIds.has(id));
  if (missingIds.length) return { ok: false, status: 400, error: 'Una o mas canchas asignadas no existen.', missingIds };

  const unavailableIds = canchas.filter((c) => c.esta_disponible !== true).map((c) => c.id);
  if (unavailableIds.length) return { ok: false, status: 400, error: 'Una o mas canchas asignadas no estan disponibles.', unavailableIds };

  return { ok: true, canchas };
};

const fetchPartidosEstadoCanchasCompat = async (torneoId, canchaIds) => {
  const selectOptions = [
    'id, cancha_id, fecha_hora, estado, ronda, ronda_orden, jugador1_id, jugador2_id, ganador_id, marcador_en_vivo, ultima_actualizacion, inicio_real',
    'id, cancha_id, fecha_hora, estado, ronda, ronda_orden, jugador1_id, jugador2_id, ganador_id',
  ];
  let lastError = null;
  for (const cols of selectOptions) {
    const { data, error } = await supabase
      .from('partidos').select(cols)
      .eq('torneo_id', torneoId).in('cancha_id', canchaIds)
      .order('fecha_hora', { ascending: true });
    if (!error) return { data: data || [], error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  return { data: [], error: lastError };
};

const validateTournamentDateRules = ({ fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion }) => {
  const inicio             = parseDateSafe(fecha_inicio);
  const fin                = parseDateSafe(fecha_fin);
  const inicioInscripcion  = parseDateSafe(fecha_inicio_inscripcion);
  const cierreInscripcion  = parseDateSafe(fecha_cierre_inscripcion);

  if (!inicio || !fin || !inicioInscripcion || !cierreInscripcion) return 'Las fechas del torneo son invalidas o estan incompletas.';
  if (fin < inicio) return 'La fecha_fin no puede ser anterior a fecha_inicio.';
  if (inicioInscripcion > cierreInscripcion) return 'La fecha_inicio_inscripcion no puede ser mayor a fecha_cierre_inscripcion.';
  if (cierreInscripcion > inicio) return 'La fecha_cierre_inscripcion no puede ser posterior a fecha_inicio.';
  return null;
};

const buildTournamentPayload = (body) => {
  const modalidadInput = body.modalidad ?? body.tipo_modalidad ?? body.tipoModalidad ?? body.tipo;
  const ramaInput      = body.rama ?? body.sexo ?? body.genero;
  const categoriaInput = body.categoria_id ?? body.categoriaId ?? body.categoria;

  const payload = {
    titulo: typeof body.titulo === 'string' ? body.titulo.trim() : body.titulo,
    costo:  body.costo === undefined || body.costo === null || body.costo === '' ? 0 : Number(body.costo),
    fecha_inicio:              body.fecha_inicio,
    fecha_fin:                 body.fecha_fin,
    fecha_inicio_inscripcion:  body.fecha_inicio_inscripcion,
    fecha_cierre_inscripcion:  body.fecha_cierre_inscripcion,
  };

  if (modalidadInput !== undefined) { const m = normalizeModalidad(modalidadInput); payload.modalidad = m ?? modalidadInput; }
  if (ramaInput      !== undefined) { const r = normalizeRama(ramaInput); payload.rama = r ?? ramaInput; }
  if (categoriaInput !== undefined) { const c = parseCategoria(categoriaInput); payload.categoria_id = c ?? categoriaInput; }
  if (body.estado    !== undefined) { payload.estado = normalizeTournamentState(body.estado); }

  return payload;
};

const formatTournamentListItem = (torneo, inscriptionSummary = null) => {
  const inscritosCount  = Number(inscriptionSummary?.aprobadas ?? torneo.inscripciones?.[0]?.count ?? 0);
  const pendientesCount = Number(inscriptionSummary?.pendientes ?? 0);
  const puntosPorRonda  = {
    32: Number(torneo.puntos_ronda_32 || 0),
    16: Number(torneo.puntos_ronda_16 || 0),
    8:  Number(torneo.puntos_ronda_8  || 0),
    4:  Number(torneo.puntos_ronda_4  || 0),
    2:  Number(torneo.puntos_ronda_2  || 0),
  };
  const puntosCampeon = Number((torneo.puntos_campeon ?? puntosPorRonda[2]) || 0);
  puntosPorRonda[1]   = puntosCampeon;

  return {
    id: torneo.id, titulo: torneo.titulo, estado: torneo.estado, costo: torneo.costo,
    inscritos: inscritosCount, inscritos_count: inscritosCount,
    solicitudes_pendientes: pendientesCount,
    fecha_inicio: torneo.fecha_inicio, fecha_fin: torneo.fecha_fin,
    modalidad: torneo.modalidad ?? null, rama: torneo.rama ?? null, categoria_id: torneo.categoria_id ?? null,
    puntos_ronda_32: puntosPorRonda[32], puntos_ronda_16: puntosPorRonda[16],
    puntos_ronda_8:  puntosPorRonda[8],  puntos_ronda_4:  puntosPorRonda[4],
    puntos_ronda_2:  puntosPorRonda[2],  puntos_campeon:  puntosCampeon,
    puntos_por_ronda: puntosPorRonda,
    fecha_inicio_inscripcion:  torneo.fecha_inicio_inscripcion,
    fecha_cierre_inscripcion:  torneo.fecha_cierre_inscripcion,
  };
};

// ─── API pública ─────────────────────────────────────────────────────────────

const getInscripcionesWhatsappTemplate = async () => {
  const { data, error } = await supabase
    .from('configuracion_admin')
    .select('clave, valor, updated_at')
    .eq('clave', ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY)
    .single();

  if (!error) {
    return {
      template:   String(data?.valor || '').trim() || DEFAULT_WHATSAPP_TEMPLATE,
      clave:      ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
      updated_at: data?.updated_at || null,
      source:     'database',
    };
  }

  if (error?.code === 'PGRST116' || isMissingRelationError(error)) {
    return {
      template:   DEFAULT_WHATSAPP_TEMPLATE,
      clave:      ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
      updated_at: null,
      source:     'default',
    };
  }

  logger.error('Error al obtener plantilla de WhatsApp:', error);
  throw new InternalError('No se pudo obtener la plantilla de WhatsApp.');
};

const updateInscripcionesWhatsappTemplate = async ({ template: templateRaw }) => {
  const template = String(templateRaw || '').trim();
  if (!template) throw new ValidationError('template es obligatorio.');
  if (template.length > MAX_WHATSAPP_TEMPLATE_LENGTH) {
    throw new ValidationError(`template supera el maximo de ${MAX_WHATSAPP_TEMPLATE_LENGTH} caracteres.`);
  }

  const nowIso = new Date().toISOString();

  const { data: updatedRow, error: updateError } = await supabase
    .from('configuracion_admin')
    .update({ valor: template, updated_at: nowIso })
    .eq('clave', ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY)
    .select('clave, valor, updated_at')
    .single();

  if (!updateError) {
    return {
      template:   String(updatedRow?.valor || '').trim() || DEFAULT_WHATSAPP_TEMPLATE,
      clave:      ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
      updated_at: updatedRow?.updated_at || nowIso,
    };
  }

  if (isMissingRelationError(updateError)) {
    logger.error('Falta tabla configuracion_admin:', updateError);
    throw new InternalError('Falta migracion de configuracion_admin en la base de datos.');
  }

  if (updateError?.code !== 'PGRST116') {
    logger.error('Error al actualizar plantilla de WhatsApp:', updateError);
    throw new InternalError('No se pudo guardar la plantilla de WhatsApp.');
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from('configuracion_admin')
    .insert([{ clave: ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY, valor: template, descripcion: 'Plantilla de mensaje de WhatsApp para gestion de inscripciones' }])
    .select('clave, valor, updated_at')
    .single();

  if (insertError) {
    if (isMissingRelationError(insertError)) throw new InternalError('Falta migracion de configuracion_admin en la base de datos.');
    logger.error('Error al crear plantilla de WhatsApp:', insertError);
    throw new InternalError('No se pudo guardar la plantilla de WhatsApp.');
  }

  return {
    template:   String(insertedRow?.valor || '').trim() || DEFAULT_WHATSAPP_TEMPLATE,
    clave:      ADMIN_CONFIG_WHATSAPP_TEMPLATE_KEY,
    updated_at: insertedRow?.updated_at || nowIso,
  };
};

const crearTorneo = async ({ clubId, body }) => {
  const { titulo, costo, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion } = body;

  if (!titulo || !fecha_inicio || !fecha_fin || !fecha_inicio_inscripcion || !fecha_cierre_inscripcion) {
    throw new ValidationError('Faltan campos obligatorios: titulo, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion.');
  }

  const payload = buildTournamentPayload({
    titulo, costo,
    modalidad: body.modalidad, tipo_modalidad: body.tipo_modalidad, tipoModalidad: body.tipoModalidad, tipo: body.tipo,
    rama: body.rama, sexo: body.sexo, genero: body.genero,
    categoria_id: body.categoria_id, categoriaId: body.categoriaId, categoria: body.categoria,
    fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion,
    estado: body.estado === undefined ? DEFAULT_INSCRIBIBLE_STATE : body.estado,
  });

  if (!payload.titulo || typeof payload.titulo !== 'string') throw new ValidationError('El titulo es obligatorio.');
  if (!Number.isFinite(payload.costo) || payload.costo < 0) throw new ValidationError('costo debe ser un numero mayor o igual a 0.');
  if (!payload.modalidad) throw new ValidationError('modalidad es obligatoria para crear torneos.');
  if (!VALID_MODALIDADES.has(payload.modalidad)) throw new ValidationError('modalidad debe ser Singles o Dobles.');
  if (!payload.rama) throw new ValidationError('rama es obligatoria para crear torneos.');
  if (!VALID_RAMAS.has(payload.rama)) throw new ValidationError('rama debe ser Masculino, Femenino o Mixto.');
  if (payload.categoria_id === undefined || payload.categoria_id === null || payload.categoria_id === '') {
    throw new ValidationError('categoria_id es obligatoria para crear torneos.');
  }

  const categoriaId = parseCategoria(payload.categoria_id);
  if (categoriaId === null) throw new ValidationError('categoria_id debe ser un numero entre 1 y 5.');
  payload.categoria_id = categoriaId;

  const { data: pointsByRound, error: pointsError } = normalizePointsByRound(body);
  if (pointsError) throw new ValidationError(pointsError);

  const { data: championPoints, error: championPointsError } = normalizeChampionPoints(body, pointsByRound);
  if (championPointsError) throw new ValidationError(championPointsError);

  payload.puntos_ronda_32 = pointsByRound[32];
  payload.puntos_ronda_16 = pointsByRound[16];
  payload.puntos_ronda_8  = pointsByRound[8];
  payload.puntos_ronda_4  = pointsByRound[4];
  payload.puntos_ronda_2  = pointsByRound[2];
  payload.puntos_campeon  = championPoints;
  payload.club_id         = clubId;

  if (!payload.estado || !isValidTournamentState(payload.estado)) throw new ValidationError('El estado del torneo no es reconocido.');
  if (payload.estado === 'borrador') throw new ValidationError('No se permite publicar torneos en estado borrador.');

  const reglasFechasError = validateTournamentDateRules(payload);
  if (reglasFechasError) throw new ValidationError(reglasFechasError);

  // Verificar límite del plan
  const { data: clubRow } = await supabase.from('clubes').select('plan').eq('id', clubId).maybeSingle();
  const planCfg = getPlanConfig(clubRow?.plan);
  const maxSimultaneous = planCfg.max_simultaneous_tournaments;

  if (maxSimultaneous !== -1 && maxSimultaneous < 100) {
    const { data: overlapCount, error: rpcError } = await supabase.rpc('check_tournament_overlap', {
      p_club_id:    clubId,
      p_start_date: payload.fecha_inicio,
      p_end_date:   payload.fecha_fin,
    });

    if (!rpcError && overlapCount >= maxSimultaneous) {
      throw new ForbiddenError(
        `Tu plan permite máximo ${maxSimultaneous} torneos simultáneos. Finalizá o cancelá uno existente, o actualizá tu plan.`,
        'LIMIT_REACHED',
        {
          message:  `Tu plan permite máximo ${maxSimultaneous} torneos simultáneos. Finalizá o cancelá uno existente, o actualizá tu plan.`,
          resource: 'torneo_simultaneo',
          current:  overlapCount,
          limit:    maxSimultaneous,
          plan:     clubRow?.plan ?? 'basico',
        },
      );
    }
  }

  const { ids: canchasIds, error: canchasParseError } = normalizeAssignedCanchas(body);
  if (canchasParseError) throw new ValidationError(canchasParseError);

  const canchaValidation = await validateAssignedCanchas(canchasIds);
  if (!canchaValidation.ok) {
    const err = new ValidationError(canchaValidation.error);
    err.status = canchaValidation.status || 400;
    if (canchaValidation.missingIds)    err.extra = { ...err.extra, missingIds:    canchaValidation.missingIds };
    if (canchaValidation.unavailableIds) err.extra = { ...err.extra, unavailableIds: canchaValidation.unavailableIds };
    throw err;
  }

  const { data, error } = await supabase.from('torneos').insert([payload]).select();
  if (error) {
    logger.error('Error al crear torneo:', error);
    throw new InternalError('Error al crear el torneo');
  }

  const torneoCreado = data[0];

  if (canchasIds.length > 0) {
    const relaciones = canchasIds.map((canchaId) => ({ torneo_id: torneoCreado.id, cancha_id: canchaId }));
    const { error: relationError } = await supabase.from('torneo_canchas').insert(relaciones);

    if (relationError) {
      await supabase.from('torneos').delete().eq('id', torneoCreado.id);
      logger.error('Error al asignar canchas al torneo:', relationError);
      throw new InternalError('Error al asignar canchas al torneo.');
    }
  }

  invalidateClub(clubId);

  return {
    message:          'Torneo creado con éxito',
    torneo:           torneoCreado,
    canchas_asignadas: canchasIds,
    canchas_ids:       canchasIds,
  };
};

const actualizarTorneo = async ({ id, body }) => {
  const { data: torneoExistente, error: fetchError } = await supabase
    .from('torneos')
    .select('id, titulo, costo, estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion, modalidad, rama, categoria_id, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon')
    .eq('id', id)
    .single();

  if (fetchError || !torneoExistente) throw new NotFoundError('Torneo no encontrado');

  const mergedData = {
    titulo:                   body.titulo                   !== undefined ? body.titulo                   : torneoExistente.titulo,
    costo:                    body.costo                    !== undefined ? body.costo                    : torneoExistente.costo,
    fecha_inicio:             body.fecha_inicio             !== undefined ? body.fecha_inicio             : torneoExistente.fecha_inicio,
    fecha_fin:                body.fecha_fin                !== undefined ? body.fecha_fin                : torneoExistente.fecha_fin,
    fecha_inicio_inscripcion: body.fecha_inicio_inscripcion !== undefined ? body.fecha_inicio_inscripcion : torneoExistente.fecha_inicio_inscripcion,
    fecha_cierre_inscripcion: body.fecha_cierre_inscripcion !== undefined ? body.fecha_cierre_inscripcion : torneoExistente.fecha_cierre_inscripcion,
    modalidad:                body.modalidad                !== undefined ? body.modalidad                : torneoExistente.modalidad,
    rama:                     body.rama                     !== undefined ? body.rama                     : torneoExistente.rama,
    categoria_id:             body.categoria_id             !== undefined ? body.categoria_id             : torneoExistente.categoria_id,
    puntos_ronda_32:          body.puntos_ronda_32          !== undefined ? body.puntos_ronda_32          : torneoExistente.puntos_ronda_32,
    puntos_ronda_16:          body.puntos_ronda_16          !== undefined ? body.puntos_ronda_16          : torneoExistente.puntos_ronda_16,
    puntos_ronda_8:           body.puntos_ronda_8           !== undefined ? body.puntos_ronda_8           : torneoExistente.puntos_ronda_8,
    puntos_ronda_4:           body.puntos_ronda_4           !== undefined ? body.puntos_ronda_4           : torneoExistente.puntos_ronda_4,
    puntos_ronda_2:           body.puntos_ronda_2           !== undefined ? body.puntos_ronda_2           : torneoExistente.puntos_ronda_2,
    puntos_campeon:           body.puntos_campeon           !== undefined ? body.puntos_campeon           : torneoExistente.puntos_campeon,
    estado:                   body.estado                   !== undefined ? body.estado                   : torneoExistente.estado,
  };

  const payload = buildTournamentPayload(mergedData);
  if (mergedData.estado !== undefined) payload.estado = normalizeTournamentState(mergedData.estado);

  if (!payload.titulo || typeof payload.titulo !== 'string') throw new ValidationError('El titulo es obligatorio.');
  if (!Number.isFinite(payload.costo) || payload.costo < 0) throw new ValidationError('costo debe ser un numero mayor o igual a 0.');
  if (payload.modalidad !== undefined && !VALID_MODALIDADES.has(payload.modalidad)) throw new ValidationError('modalidad debe ser Singles o Dobles.');
  if (payload.rama      !== undefined && !VALID_RAMAS.has(payload.rama)) throw new ValidationError('rama debe ser Masculino, Femenino o Mixto.');

  if (payload.categoria_id !== undefined) {
    const cId = parseCategoria(payload.categoria_id);
    if (cId === null) throw new ValidationError('categoria_id debe ser un numero entre 1 y 5.');
    payload.categoria_id = cId;
  }

  const { data: pts, error: pointsError } = normalizePointsByRound(mergedData);
  if (pointsError) throw new ValidationError(pointsError);

  const { data: champ, error: champError } = normalizeChampionPoints(mergedData, pts);
  if (champError) throw new ValidationError(champError);

  payload.puntos_ronda_32 = pts[32];
  payload.puntos_ronda_16 = pts[16];
  payload.puntos_ronda_8  = pts[8];
  payload.puntos_ronda_4  = pts[4];
  payload.puntos_ronda_2  = pts[2];
  payload.puntos_campeon  = champ;

  if (payload.estado !== undefined && !isValidTournamentState(payload.estado)) throw new ValidationError('El estado del torneo no es reconocido.');

  const reglasFechasError = validateTournamentDateRules(payload);
  if (reglasFechasError) throw new ValidationError(reglasFechasError);

  const { data, error } = await supabase
    .from('torneos').update(payload).eq('id', id).select().single();

  if (error) {
    logger.error('Error al editar torneo:', error);
    throw new InternalError('Error al editar el torneo');
  }

  return { message: 'Torneo actualizado con exito', torneo: data };
};

const actualizarEstadoTorneo = async ({ id, body }) => {
  if (!UUID_REGEX.test(id)) throw new ValidationError('El torneoId es invalido.');

  const estadoInput = body?.estado ?? body?.state ?? body?.status;
  const estadoNormalizado = typeof estadoInput === 'string' ? normalizeTournamentState(estadoInput) : null;
  const estado = isValidTournamentState(estadoNormalizado) ? estadoNormalizado : 'en_progreso';

  const { data, error } = await supabase
    .from('torneos').update({ estado }).eq('id', id).select('id, estado').single();

  if (error || !data) {
    if (error?.code === 'PGRST116') throw new NotFoundError('Torneo no encontrado');
    logger.error('Error al actualizar estado del torneo:', error);
    throw new InternalError('Error al actualizar estado del torneo');
  }

  return { message: 'Estado del torneo actualizado.', torneo: data };
};

const actualizarTorneoCompat = async ({ id, body }) => {
  const keys = Object.keys(body || {});
  if (!keys.length) return { message: 'Sin cambios para aplicar en torneo.', torneo: { id } };

  const stateKeys = new Set(['estado', 'state', 'status']);
  if (keys.every((k) => stateKeys.has(k))) return actualizarEstadoTorneo({ id, body });

  const partidoCompatKeys = new Set([
    'partido_id', 'partidoId', 'ganador_id', 'ganadorId', 'winner_id', 'winnerId',
    'ganador', 'winner', 'score', 'resultado', 'marcador', 'marcador_en_vivo',
    'estado_partido', 'finalizar', 'ronda', 'ronda_orden', 'orden_en_ronda',
    'cancha_id', 'canchaId', 'fecha_hora', 'fechaHora',
  ]);
  const torneoBusinessKeys = new Set([
    'titulo', 'costo', 'fecha_inicio', 'fecha_fin', 'fecha_inicio_inscripcion', 'fecha_cierre_inscripcion',
    'modalidad', 'tipo_modalidad', 'tipoModalidad', 'tipo', 'rama', 'sexo', 'genero',
    'categoria_id', 'categoriaId', 'categoria', 'puntos_por_ronda',
    'puntos_ronda_32', 'puntos_ronda_16', 'puntos_ronda_8', 'puntos_ronda_4', 'puntos_ronda_2',
    'puntos_campeon', 'puntos_ronda_1', 'canchas_asignadas', 'canchas_ids',
  ]);

  const hasPartidoCompatKeys = keys.some((k) => partidoCompatKeys.has(k));
  const hasTorneoBusinessKeys = keys.some((k) => torneoBusinessKeys.has(k));

  if (hasPartidoCompatKeys && !hasTorneoBusinessKeys) {
    return {
      message: 'Payload de partido recibido en endpoint de torneo. Request ignorada por compatibilidad.',
      torneo: { id },
    };
  }

  return actualizarTorneo({ id, body });
};

const _fetchTorneosDisponibles = async ({ clubId }) => {
  const { data: torneos, error } = await supabase
    .from('torneos')
    .select('id, titulo, estado, costo, fecha_inicio, fecha_fin, modalidad, rama, categoria_id, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon, fecha_inicio_inscripcion, fecha_cierre_inscripcion')
    .eq('club_id', clubId)
    .order('fecha_inicio', { ascending: true });

  if (error) {
    logger.error('Error al obtener torneos disponibles:', error);
    throw new InternalError('Error al listar torneos');
  }

  const torneoIds = (torneos || []).map((t) => t.id);
  const { summaryByTournament, error: summaryError } = await fetchTournamentInscriptionSummaryCompat(torneoIds, clubId);
  if (summaryError) {
    logger.error('Error al obtener resumen de inscripciones:', summaryError);
    throw new InternalError('Error al listar torneos');
  }

  const ahora = new Date();
  return (torneos || [])
    .filter((t) => {
      const estado = normalizeTournamentState(t.estado);
      if (!INSCRIBIBLE_STATES.has(estado) || NON_AVAILABLE_STATES.has(estado)) return false;
      const inicioInscripcion  = parseDateSafe(t.fecha_inicio_inscripcion);
      const cierreInscripcion  = parseDateSafe(t.fecha_cierre_inscripcion);
      if (!inicioInscripcion || !cierreInscripcion) return false;
      if (ahora < inicioInscripcion || ahora > cierreInscripcion) return false;
      return true;
    })
    .map((t) => {
      const summary = summaryByTournament.get(String(t.id || '').trim()) || { aprobadas: 0, pendientes: 0 };
      return { ...formatTournamentListItem(t, summary), disponible: true, inscripciones: undefined };
    });
};

const obtenerTorneosDisponibles = ({ clubId }) =>
  cache.getOrFetchSWR(`torneos:disponibles:${clubId}`, cache.TTL.TORNEOS, () => _fetchTorneosDisponibles({ clubId }));

const _fetchTodosLosTorneos = async ({ clubId }) => {
  const { data: torneos, error } = await supabase
    .from('torneos')
    .select('id, titulo, estado, costo, fecha_inicio, fecha_fin, modalidad, rama, categoria_id, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon, fecha_inicio_inscripcion, fecha_cierre_inscripcion')
    .eq('club_id', clubId)
    .neq('estado', 'cancelado')
    .order('fecha_inicio', { ascending: false });

  if (error) {
    logger.error('Error al obtener todos los torneos:', error);
    throw new InternalError('Error al listar torneos');
  }

  const torneoIds = (torneos || []).map((t) => t.id);
  const { summaryByTournament, error: summaryError } = await fetchTournamentInscriptionSummaryCompat(torneoIds, clubId);
  if (summaryError) {
    logger.error('Error al obtener resumen de inscripciones:', summaryError);
    throw new InternalError('Error al listar torneos');
  }

  return (torneos || []).map((t) => {
    const summary = summaryByTournament.get(String(t.id || '').trim()) || { aprobadas: 0, pendientes: 0 };
    return { ...formatTournamentListItem(t, summary), disponible: true };
  });
};

const obtenerTodosLosTorneos = ({ clubId }) =>
  cache.getOrFetchSWR(`torneos:all:${clubId}`, cache.TTL.TORNEOS, () => _fetchTodosLosTorneos({ clubId }));

const invalidateTorneosCache = (clubId) => invalidateClub(clubId);

const listarCompanerosDoblesDisponibles = async ({ clubId, torneoId, jugadorBaseId, q }) => {
  if (!UUID_REGEX.test(torneoId)) throw new ValidationError('torneoId invalido.');
  if (!UUID_REGEX.test(jugadorBaseId)) throw new ValidationError('jugador_id invalido.');

  const { data: torneo, error: torneoError } = await supabase
    .from('torneos').select('id, modalidad, rama, categoria_id')
    .eq('id', torneoId).eq('club_id', clubId).single();

  if (torneoError || !torneo) throw new NotFoundError('Torneo no encontrado.');
  if (!isDoblesModalidad(torneo.modalidad)) return [];

  const modalidadTorneo = normalizeModalidad(torneo.modalidad);
  const ramaTorneo      = normalizeRama(torneo.rama);
  const categoriaTorneo = parseCategoria(torneo.categoria_id);

  const { data: perfilBase, error: perfilBaseError } = await fetchPerfilCompat(jugadorBaseId, clubId);
  if (perfilBaseError || !perfilBase) throw new NotFoundError('Perfil del jugador base no encontrado.');

  const categoriaBase = resolveCategoriaPerfilPorModalidad(perfilBase, modalidadTorneo);
  const sexoBase      = normalizeRama(perfilBase.sexo);

  let candidatosQuery = supabase
    .from('perfiles')
    .select('id, nombre_completo, sexo, categoria, categoria_singles, categoria_dobles')
    .eq('club_id', clubId).neq('id', jugadorBaseId)
    .order('nombre_completo', { ascending: true }).limit(25);

  if (q) candidatosQuery = candidatosQuery.ilike('nombre_completo', `%${q}%`);

  const { data: candidatosRaw, error: candidatosError } = await candidatosQuery;
  if (candidatosError) {
    logger.error('Error al buscar companeros de dobles:', candidatosError);
    throw new InternalError('No se pudieron buscar companeros.');
  }

  const { data: inscripcionesRaw, error: inscripcionesError } = await supabase
    .from('inscripciones').select('jugador_id')
    .eq('torneo_id', torneoId).eq('club_id', clubId);

  if (inscripcionesError) {
    logger.error('Error al listar inscripciones para filtrar companeros:', inscripcionesError);
    throw new InternalError('No se pudo validar la disponibilidad de companeros.');
  }

  const inscritosSet = new Set((inscripcionesRaw || []).map((r) => String(r?.jugador_id || '').trim()).filter(Boolean));
  inscritosSet.add(jugadorBaseId);

  return (candidatosRaw || []).filter((perfil) => {
    if (!perfil?.id || inscritosSet.has(String(perfil.id).trim())) return false;
    const sexoPerfil      = normalizeRama(perfil.sexo);
    const categoriaPerfil = resolveCategoriaPerfilPorModalidad(perfil, modalidadTorneo);
    if (!sexoPerfil || categoriaPerfil === null) return false;
    if (categoriaTorneo !== null && categoriaPerfil !== categoriaTorneo) return false;
    if (categoriaBase   !== null && categoriaPerfil !== categoriaBase)   return false;
    if (ramaTorneo === 'Masculino' && sexoPerfil !== 'Masculino') return false;
    if (ramaTorneo === 'Femenino'  && sexoPerfil !== 'Femenino')  return false;
    if (ramaTorneo === 'Mixto' && sexoBase && !areOppositeSexes(sexoBase, sexoPerfil)) return false;
    return true;
  });
};

const inscribirJugador = async ({ clubId, torneoId, body }) => {
  const { jugador_id, pareja_jugador_id, disponibilidad_inscripcion, disponibilidad } = body;
  const parejaJugadorId  = String(pareja_jugador_id || '').trim();
  const franjasEntrada   = Array.isArray(disponibilidad_inscripcion) ? disponibilidad_inscripcion : disponibilidad;

  if (!jugador_id) throw new ValidationError('Falta el ID del jugador');
  if (!Array.isArray(franjasEntrada) || !franjasEntrada.length) {
    throw new ValidationError('disponibilidad_inscripcion (o disponibilidad legacy) debe ser un arreglo no vacio.');
  }

  const { data: torneoInfo, error: torneoError } = await supabase
    .from('torneos')
    .select('estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion, modalidad, rama, categoria_id')
    .eq('id', torneoId).eq('club_id', clubId).single();

  if (torneoError || !torneoInfo) throw new NotFoundError('Torneo no encontrado');

  const estadoTorneo = normalizeTournamentState(torneoInfo.estado);
  if (!INSCRIBIBLE_STATES.has(estadoTorneo)) throw new ConflictError('El torneo no está publicado para inscripción.');

  const ahora            = new Date();
  const inicioInscripcion = parseDateSafe(torneoInfo.fecha_inicio_inscripcion);
  const cierreInscripcion = parseDateSafe(torneoInfo.fecha_cierre_inscripcion);

  if (!inicioInscripcion || !cierreInscripcion || ahora < inicioInscripcion || ahora > cierreInscripcion) {
    throw new ConflictError('El periodo de inscripción para este torneo no está activo.');
  }

  const modalidadTorneo = normalizeModalidad(torneoInfo.modalidad);
  const ramaTorneo      = normalizeRama(torneoInfo.rama);
  const categoriaTorneo = parseCategoria(torneoInfo.categoria_id);

  if (!modalidadTorneo || !ramaTorneo || categoriaTorneo === null) {
    throw new ConflictError('El torneo no tiene definidos modalidad/rama/categoria para validar inscripciones.');
  }

  const { data: perfilJugador, error: perfilError } = await fetchPerfilCompat(jugador_id, clubId);
  if (perfilError || !perfilJugador) throw new NotFoundError('Perfil del jugador no encontrado.');

  const sexoJugador      = normalizeRama(perfilJugador.sexo);
  const categoriaJugador = resolveCategoriaPerfilPorModalidad(perfilJugador, modalidadTorneo);

  if (!sexoJugador || categoriaJugador === null) {
    throw new ConflictError('El perfil del jugador no tiene sexo/categoria configurados para esta modalidad.');
  }

  const sexoCoincide      = ramaTorneo === 'Mixto' ? true : sexoJugador === ramaTorneo;
  const categoriaCoincide = categoriaJugador === categoriaTorneo;

  if (!sexoCoincide || !categoriaCoincide) {
    const err = new ConflictError('No cumples con los requisitos del torneo.');
    err.extra = {
      error:     'No cumples con los requisitos del torneo. El boton Inscribirme solo debe habilitarse si sexo y categoria coinciden con el torneo.',
      requisitos: { modalidad: modalidadTorneo, rama: ramaTorneo, categoria_id: categoriaTorneo },
      perfil:     { sexo: sexoJugador, categoria: categoriaJugador },
    };
    throw err;
  }

  const torneoEsDobles = isDoblesModalidad(modalidadTorneo);

  if (torneoEsDobles) {
    if (!parejaJugadorId) throw new ValidationError('En torneos de dobles debes indicar pareja_jugador_id.');
    if (!UUID_REGEX.test(parejaJugadorId)) throw new ValidationError('pareja_jugador_id debe ser un UUID valido.');
    if (String(jugador_id).trim() === parejaJugadorId) throw new ValidationError('No puedes inscribirte contigo mismo como pareja.');

    const { data: perfilParejaRaw, error: perfilParejaError } = await fetchPerfilCompat(parejaJugadorId, clubId);
    if (perfilParejaError || !perfilParejaRaw) throw new NotFoundError('El perfil de la pareja no fue encontrado en este club.');

    const sexoPareja      = normalizeRama(perfilParejaRaw.sexo);
    const categoriaPareja = resolveCategoriaPerfilPorModalidad(perfilParejaRaw, modalidadTorneo);

    if (!sexoPareja || categoriaPareja === null) throw new ConflictError('El perfil de la pareja no tiene sexo/categoria configurados para esta modalidad.');
    if (categoriaPareja !== categoriaTorneo || categoriaPareja !== categoriaJugador) throw new ConflictError('La pareja debe coincidir con la misma categoria del torneo y del jugador titular.');
    if (ramaTorneo === 'Masculino' && sexoPareja !== 'Masculino') throw new ConflictError('La pareja no cumple con la rama Masculino del torneo.');
    if (ramaTorneo === 'Femenino'  && sexoPareja !== 'Femenino')  throw new ConflictError('La pareja no cumple con la rama Femenino del torneo.');
    if (ramaTorneo === 'Mixto' && !areOppositeSexes(sexoJugador, sexoPareja)) throw new ConflictError('En dobles mixto la pareja debe estar compuesta por un Masculino y un Femenino.');
  }

  const fechaInicioTorneo = toUtcDateOnly(torneoInfo.fecha_inicio);
  const fechaFinTorneo    = toUtcDateOnly(torneoInfo.fecha_fin);
  if (!fechaInicioTorneo || !fechaFinTorneo) throw new ConflictError('El torneo no tiene definido un rango valido de fechas.');

  const franjasNormalizadas = [];
  for (let i = 0; i < franjasEntrada.length; i++) {
    const franja = franjasEntrada[i] || {};
    const { fecha, dia_semana, hora_inicio, hora_fin } = franja;

    if (!fecha || dia_semana === undefined || !hora_inicio || !hora_fin) {
      throw new ValidationError(`La franja ${i + 1} es invalida. Requiere fecha, dia_semana, hora_inicio y hora_fin.`);
    }
    const diaSemanaInt = Number(dia_semana);
    if (!Number.isInteger(diaSemanaInt) || diaSemanaInt < 0 || diaSemanaInt > 6) {
      throw new ValidationError(`La franja ${i + 1} tiene dia_semana fuera de rango (0..6).`);
    }
    const horaInicioMin = parseTimeToMinutes(hora_inicio);
    const horaFinMin    = parseTimeToMinutes(hora_fin);
    if (horaInicioMin === null || horaFinMin === null || horaInicioMin >= horaFinMin) {
      throw new ValidationError(`La franja ${i + 1} tiene un rango horario invalido.`);
    }
    const fechaFranja = toUtcDateOnly(fecha);
    if (!fechaFranja) throw new ValidationError(`La franja ${i + 1} tiene una fecha invalida.`);
    if (fechaFranja < fechaInicioTorneo || fechaFranja > fechaFinTorneo) {
      throw new ValidationError(`La franja ${i + 1} esta fuera del rango [fecha_inicio, fecha_fin] del torneo.`);
    }
    franjasNormalizadas.push({
      torneo_id, jugador_id, fecha: toDateOnlyString(fecha), dia_semana: diaSemanaInt,
      hora_inicio: hora_inicio.trim(), hora_fin: hora_fin.trim(),
      es_obligatoria_fin_semana: Boolean(franja.es_obligatoria_fin_semana),
    });
  }

  const { data: inscripcionExistente, error: existingFetchError } = await fetchInscripcionByTournamentPlayerCompat({ torneoId, jugadorId: jugador_id, clubId });
  if (existingFetchError) {
    logger.error('Error al verificar inscripcion existente:', existingFetchError);
    throw new InternalError('Error al procesar la inscripción');
  }

  if (inscripcionExistente) {
    const estadoExistente = resolveInscriptionStatusCompat(inscripcionExistente);
    if (estadoExistente === INSCRIPTION_STATUS_PENDING)  throw new ConflictError('Ya tienes una solicitud pendiente de aprobación para este torneo.');
    if (estadoExistente === INSCRIPTION_STATUS_APPROVED) throw new ConflictError('Tu inscripción ya fue aprobada para este torneo.');
    if (estadoExistente === INSCRIPTION_STATUS_REJECTED) throw new ConflictError('Tu solicitud anterior fue rechazada. Contacta a un administrador para volver a postularte.');
    throw new ConflictError('El jugador ya tiene una inscripción asociada a este torneo.');
  }

  if (torneoEsDobles) {
    const { data: inscripcionParejaExistente, error: inscripcionParejaError } = await fetchInscripcionByTournamentPlayerCompat({ torneoId, jugadorId: parejaJugadorId, clubId });
    if (inscripcionParejaError) {
      logger.error('Error al verificar inscripción de la pareja:', inscripcionParejaError);
      throw new InternalError('No se pudo verificar la disponibilidad de la pareja.');
    }
    if (inscripcionParejaExistente) throw new ConflictError('La pareja seleccionada ya tiene una inscripción para este torneo.');
  }

  const parejaId = torneoEsDobles ? randomUUID() : null;
  const jugadoresDisponibilidad = torneoEsDobles ? [jugador_id, parejaJugadorId] : [jugador_id];
  const disponibilidadRpc = jugadoresDisponibilidad.flatMap((jugadorIdActual) =>
    franjasNormalizadas.map((franja) => ({
      jugador_id:                jugadorIdActual,
      torneo_id:                 franja.torneo_id,
      fecha:                     franja.fecha,
      dia_semana:                franja.dia_semana,
      hora_inicio:               franja.hora_inicio,
      hora_fin:                  franja.hora_fin,
      es_obligatoria_fin_semana: franja.es_obligatoria_fin_semana,
    })),
  );

  const { data: rpcResult, error: rpcError } = await supabase.rpc('inscribir_jugador_atomico', {
    p_club_id:            clubId,
    p_torneo_id:          torneoId,
    p_jugador_id:         jugador_id,
    p_pareja_jugador_id:  torneoEsDobles ? parejaJugadorId : null,
    p_pareja_id:          parejaId,
    p_estado:             mapLegacyStateFromInscriptionStatus(INSCRIPTION_STATUS_PENDING),
    p_estado_inscripcion: INSCRIPTION_STATUS_PENDING,
    p_disponibilidad:     JSON.stringify(disponibilidadRpc),
  });

  if (rpcError) {
    logger.error('[inscribir] Error en RPC inscribir_jugador_atomico', rpcError, { club_id: clubId, torneo_id: torneoId, jugador_id });
    throw new InternalError('Error al procesar la inscripción');
  }

  if (!rpcResult?.ok) {
    if (rpcResult?.error_code === '23505') {
      metrics.increment('torneo.inscripcion.conflict');
      throw new ConflictError('Ya existe una solicitud o inscripción para alguno de los jugadores de la pareja.');
    }
    logger.alert('[inscribir] RPC rpc_inscribir_jugador falló', {
      alert_type: 'rpc_error',
      club_id:    clubId,
      torneo_id:  torneoId,
      jugador_id,
      error_code: rpcResult?.error_code,
    });
    throw new InternalError('Error al procesar la inscripción');
  }

  emitPendingInscriptionsUpdated({
    tipo: 'nueva_solicitud', torneo_id: torneoId, jugador_id,
    pareja_jugador_id: torneoEsDobles ? parejaJugadorId : null,
  });

  metrics.increment('torneo.inscripcion.success');
  invalidateClub(clubId);
  return {
    message: torneoEsDobles
      ? 'La solicitud de la pareja fue enviada y esta siendo revisada por el administrador.'
      : 'Tu solicitud fue enviada. Tu inscripción está siendo revisada por el administrador.',
    inscripcion:             { id: rpcResult.inscripcion_id },
    estado:                  mapLegacyStateFromInscriptionStatus(INSCRIPTION_STATUS_PENDING),
    estado_inscripcion:      INSCRIPTION_STATUS_PENDING,
    disponibilidad_guardada: disponibilidadRpc.length,
    pareja_jugador_id:       torneoEsDobles ? parejaJugadorId : null,
    pareja_id:               torneoEsDobles ? parejaId : null,
  };
};

const obtenerInscripcionesPendientesAdmin = async ({ clubId }) => {
  const selectOptions = [
    'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, fecha_validacion, motivo_rechazo, torneos(id, titulo, modalidad, rama, categoria_id), jugador_perfil:perfiles!inscripciones_jugador_id_fkey(id, nombre_completo, telefono), pareja_perfil:perfiles!inscripciones_pareja_jugador_fk(id, nombre_completo, telefono)',
    'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, torneos(id, titulo, modalidad, rama, categoria_id), jugador_perfil:perfiles!inscripciones_jugador_id_fkey(id, nombre_completo, telefono), pareja_perfil:perfiles!inscripciones_pareja_jugador_fk(id, nombre_completo, telefono)',
    'id, torneo_id, jugador_id, estado, fecha_inscripcion, torneos(id, titulo, modalidad, rama, categoria_id), jugador_perfil:perfiles!inscripciones_jugador_id_fkey(id, nombre_completo, telefono)',
    'id, torneo_id, jugador_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, fecha_validacion, motivo_rechazo, torneos(id, titulo, modalidad, rama, categoria_id)',
  ];

  let pendingRows = [];
  let fetchError  = null;

  for (const columns of selectOptions) {
    const query = supabase.from('inscripciones').select(columns).eq('club_id', clubId)
      .order('fecha_inscripcion', { ascending: true });
    const usesNew = columns.includes('estado_inscripcion');
    const filteredQuery = usesNew
      ? query.in('estado_inscripcion', [INSCRIPTION_STATUS_PENDING, INSCRIPTION_STATUS_WITHDRAWAL_PENDING])
      : query.in('estado', ['pendiente', 'pendiente_revision', 'lista_espera']);

    const { data, error } = await filteredQuery;
    if (!error) { pendingRows = data || []; fetchError = null; break; }
    fetchError = error;
    if (!isMissingColumnError(error) && !isMissingRelationError(error)) break;
  }

  if (fetchError) {
    logger.error('Error al obtener inscripciones pendientes:', fetchError);
    throw new InternalError('No se pudieron cargar las inscripciones pendientes.');
  }

  return (pendingRows || [])
    .map((item) => {
      const torneo  = Array.isArray(item?.torneos)        ? item.torneos[0]        : item?.torneos;
      const jugador = Array.isArray(item?.jugador_perfil) ? item.jugador_perfil[0] : item?.jugador_perfil;
      const pareja  = Array.isArray(item?.pareja_perfil)  ? item.pareja_perfil[0]  : item?.pareja_perfil;
      return {
        id: item.id, torneo_id: item.torneo_id, jugador_id: item.jugador_id,
        pareja_id: item.pareja_id ?? null, pareja_jugador_id: item.pareja_jugador_id ?? null,
        estado: item.estado ?? null,
        estado_inscripcion: resolveInscriptionStatusCompat(item) || INSCRIPTION_STATUS_PENDING,
        fecha_inscripcion: item.fecha_inscripcion ?? null, fecha_validacion: item.fecha_validacion ?? null,
        motivo_rechazo: item.motivo_rechazo ?? null,
        torneo: torneo || null, jugador: jugador || null, pareja: pareja || null,
      };
    })
    .filter((item) => [INSCRIPTION_STATUS_PENDING, INSCRIPTION_STATUS_WITHDRAWAL_PENDING].includes(item.estado_inscripcion));
};

const validarInscripcionAdmin = async ({ clubId, inscripcionId, body }) => {
  if (!UUID_REGEX.test(inscripcionId)) throw new ValidationError('El id de inscripción es inválido.');

  const estadoObjetivo = normalizeInscriptionStatus(body?.estado_inscripcion ?? body?.estado);
  const motivoRaw      = typeof body?.motivo_rechazo === 'string' ? body.motivo_rechazo.trim() : '';

  if (![INSCRIPTION_STATUS_APPROVED, INSCRIPTION_STATUS_REJECTED].includes(estadoObjetivo)) {
    throw new ValidationError('estado_inscripcion debe ser aprobada o rechazada.');
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
      .from('inscripciones').select(columns).eq('id', inscripcionId).eq('club_id', clubId).single();
    if (!error) { inscripcion = data; fetchError = null; break; }
    fetchError = error;
    if (error?.code === 'PGRST116') throw new NotFoundError('Inscripción no encontrada.');
    if (!isMissingColumnError(error)) break;
  }

  if (fetchError) {
    logger.error('Error al obtener inscripción para validar:', fetchError);
    throw new InternalError('No se pudo validar la inscripción.');
  }

  const estadoActual = resolveInscriptionStatusCompat(inscripcion);
  if (estadoActual === estadoObjetivo) {
    return {
      message:     `La inscripción ya estaba ${estadoObjetivo}.`,
      inscripcion: { ...inscripcion, estado_inscripcion: estadoObjetivo },
    };
  }

  if (![INSCRIPTION_STATUS_PENDING, INSCRIPTION_STATUS_WITHDRAWAL_PENDING].includes(estadoActual)) {
    throw new ConflictError('Solo se pueden resolver solicitudes en estado pendiente o pendiente de baja.');
  }

  const basePayload = {
    estado: mapLegacyStateFromInscriptionStatus(estadoObjetivo),
    pago_confirmado: estadoObjetivo === INSCRIPTION_STATUS_APPROVED,
  };

  const payloadWithStatus = {
    ...basePayload,
    estado_inscripcion: estadoObjetivo,
    fecha_validacion:   new Date().toISOString(),
    motivo_rechazo:     estadoObjetivo === INSCRIPTION_STATUS_REJECTED ? (motivoRaw || null) : null,
  };

  const updateAttempts     = [payloadWithStatus, basePayload];
  let updateError          = null;
  let updatedRows          = [];
  const shouldUpdatePair   = Boolean(inscripcion?.pareja_id);

  for (let idx = 0; idx < updateAttempts.length; idx++) {
    const payload = updateAttempts[idx];
    let query = supabase.from('inscripciones').update(payload).select();
    query = shouldUpdatePair
      ? query.eq('torneo_id', inscripcion.torneo_id).eq('pareja_id', inscripcion.pareja_id).eq('club_id', clubId)
      : query.eq('id', inscripcionId);

    const { data, error } = await query;
    if (!error) { updatedRows = Array.isArray(data) ? data : (data ? [data] : []); updateError = null; break; }
    updateError = error;
    if (!isMissingColumnError(error) || idx === updateAttempts.length - 1) break;
  }

  if (updateError) {
    logger.error('Error al actualizar inscripción:', updateError);
    throw new InternalError('No se pudo actualizar el estado de la inscripción.');
  }

  emitPendingInscriptionsUpdated({
    tipo: 'resolucion_solicitud', torneo_id: inscripcion.torneo_id,
    jugador_id: inscripcion.jugador_id, pareja_jugador_id: inscripcion?.pareja_jugador_id || null,
    estado_inscripcion: estadoObjetivo,
  });

  const updatedPrincipal = updatedRows.find((row) => String(row?.jugador_id || '').trim() === String(inscripcion.jugador_id || '').trim())
    || updatedRows[0] || null;

  invalidateClub(clubId);

  return {
    message:                   estadoObjetivo === INSCRIPTION_STATUS_APPROVED ? 'Inscripción aprobada correctamente.' : 'Inscripción rechazada correctamente.',
    inscripcion:               { ...updatedPrincipal, estado_inscripcion: estadoObjetivo },
    inscripciones_actualizadas: updatedRows,
  };
};

const obtenerInscripcionesPorJugador = async ({ clubId, jugadorId }) => {
  if (!UUID_REGEX.test(jugadorId)) throw new ValidationError('El jugador_id es invalido.');

  const selectOptions = [
    'id, torneo_id, jugador_id, pareja_id, pareja_jugador_id, estado, estado_inscripcion, fecha_inscripcion, fecha_validacion, motivo_rechazo',
    'id, torneo_id, jugador_id, estado, estado_inscripcion, fecha_inscripcion',
    'id, torneo_id, jugador_id, estado, fecha_inscripcion',
  ];

  let fetchError = null;
  let rows = [];

  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones').select(columns)
      .eq('jugador_id', jugadorId).eq('club_id', clubId)
      .order('fecha_inscripcion', { ascending: false });
    if (!error) { rows = data || []; fetchError = null; break; }
    fetchError = error;
    if (!isMissingColumnError(error)) break;
  }

  if (fetchError) {
    logger.error('Error al listar inscripciones del jugador:', fetchError);
    throw new InternalError('No se pudieron listar las inscripciones del jugador.');
  }

  return (rows || []).map((row) => ({
    id: row.id, torneo_id: row.torneo_id, jugador_id: row.jugador_id,
    pareja_id: row.pareja_id ?? null, pareja_jugador_id: row.pareja_jugador_id ?? null,
    estado: row.estado ?? null,
    estado_inscripcion: resolveInscriptionStatusCompat(row),
    fecha_inscripcion: row.fecha_inscripcion ?? null,
    fecha_validacion: row.fecha_validacion ?? null,
    motivo_rechazo: row.motivo_rechazo ?? null,
  }));
};

const obtenerCanchasDelTorneo = async ({ torneoId }) => {
  if (!UUID_REGEX.test(torneoId)) throw new ValidationError('El torneoId es invalido.');

  const { data: torneo, error: torneoError } = await supabase
    .from('torneos').select('id').eq('id', torneoId).single();

  if (torneoError || !torneo) throw new NotFoundError('Torneo no encontrado');

  const { data: relaciones, error: relacionesError } = await supabase
    .from('torneo_canchas').select('cancha_id').eq('torneo_id', torneoId);

  if (relacionesError) {
    logger.error('Error al obtener canchas del torneo:', relacionesError);
    throw new InternalError('Error al obtener canchas del torneo');
  }

  const canchaIds = [...new Set((relaciones || []).map((r) => r.cancha_id).filter(Boolean))];
  if (!canchaIds.length) return [];

  const { data: canchas, error: canchasError } = await supabase
    .from('canchas')
    .select('id, nombre, tipo_superficie, esta_disponible, descripcion')
    .in('id', canchaIds).order('nombre', { ascending: true });

  if (canchasError) {
    logger.error('Error al listar canchas asignadas:', canchasError);
    throw new InternalError('Error al obtener canchas del torneo');
  }

  return canchas || [];
};

const obtenerEstadoCanchas = async ({ torneoId }) => {
  if (!UUID_REGEX.test(torneoId)) throw new ValidationError('El torneoId es invalido.');

  const { data: torneo, error: torneoError } = await supabase
    .from('torneos').select('id, titulo, estado').eq('id', torneoId).single();

  if (torneoError || !torneo) throw new NotFoundError('Torneo no encontrado');

  const { data: relaciones, error: relacionesError } = await supabase
    .from('torneo_canchas').select('cancha_id').eq('torneo_id', torneoId);

  if (relacionesError) {
    logger.error('Error al obtener relaciones torneo_canchas:', relacionesError);
    throw new InternalError('Error al obtener estado de canchas');
  }

  const canchaIds = [...new Set((relaciones || []).map((r) => r.cancha_id).filter(Boolean))];

  if (!canchaIds.length) {
    return {
      torneo: { id: torneo.id, titulo: torneo.titulo, estado: torneo.estado },
      canchas: [],
    };
  }

  const [canchasResult, partidosResult] = await Promise.all([
    supabase.from('canchas').select('id, nombre, tipo_superficie, esta_disponible').in('id', canchaIds).order('nombre', { ascending: true }),
    fetchPartidosEstadoCanchasCompat(torneoId, canchaIds),
  ]);

  if (canchasResult.error) {
    logger.error('Error al listar canchas del torneo:', canchasResult.error);
    throw new InternalError('Error al obtener estado de canchas');
  }
  if (partidosResult.error) {
    logger.error('Error al obtener partidos por cancha:', partidosResult.error);
    throw new InternalError('Error al obtener estado de canchas');
  }

  const canchas  = canchasResult.data || [];
  const partidos = partidosResult.data || [];

  const jugadorIds = [...new Set(partidos.flatMap((p) => [p.jugador1_id, p.jugador2_id]).filter(Boolean))];
  let perfilById   = new Map();

  if (jugadorIds.length > 0) {
    const { data: perfiles, error: perfilesError } = await supabase
      .from('perfiles').select('id, nombre_completo').in('id', jugadorIds);
    if (perfilesError) {
      logger.error('Error al obtener perfiles para estado de canchas:', perfilesError);
      throw new InternalError('Error al obtener estado de canchas');
    }
    perfilById = new Map((perfiles || []).map((p) => [p.id, p]));
  }

  const nowMs = Date.now();
  const buildPartido = (partido) => {
    if (!partido) return null;
    return {
      ...partido,
      jugador1: partido.jugador1_id ? { id: partido.jugador1_id, nombre_completo: perfilById.get(partido.jugador1_id)?.nombre_completo || null } : null,
      jugador2: partido.jugador2_id ? { id: partido.jugador2_id, nombre_completo: perfilById.get(partido.jugador2_id)?.nombre_completo || null } : null,
    };
  };

  const byCancha = new Map();
  for (const partido of partidos) {
    if (!partido?.cancha_id) continue;
    if (!byCancha.has(partido.cancha_id)) byCancha.set(partido.cancha_id, []);
    byCancha.get(partido.cancha_id).push(partido);
  }

  const canchasEstado = canchas.map((cancha) => {
    const partidosCancha = (byCancha.get(cancha.id) || []).slice().sort((a, b) => {
      const aMs = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Number.MAX_SAFE_INTEGER;
      const bMs = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Number.MAX_SAFE_INTEGER;
      return aMs - bMs;
    });

    const partidoActual = partidosCancha.find((p) => p.estado === 'en_juego') || null;

    let proximoPartido = null;
    if (partidoActual) {
      const baseMs = partidoActual.fecha_hora ? new Date(partidoActual.fecha_hora).getTime() : nowMs;
      proximoPartido = partidosCancha.find((p) =>
        p.id !== partidoActual.id && p.estado === 'programado' && (!p.fecha_hora || new Date(p.fecha_hora).getTime() >= baseMs),
      ) || null;
    } else {
      proximoPartido = partidosCancha.find((p) =>
        p.estado === 'programado' && (!p.fecha_hora || new Date(p.fecha_hora).getTime() >= nowMs),
      ) || partidosCancha.find((p) => p.estado === 'programado') || null;
    }

    return {
      cancha,
      estado_cancha:     partidoActual ? 'ocupada' : 'libre',
      partido_actual:    buildPartido(partidoActual),
      proximo_partido:   buildPartido(proximoPartido),
      partidos_restantes: partidosCancha.filter((p) => p.estado !== 'finalizado').length,
    };
  });

  return {
    torneo:              { id: torneo.id, titulo: torneo.titulo, estado: torneo.estado },
    canchas:             canchasEstado,
    ultima_actualizacion: new Date().toISOString(),
  };
};

const solicitarBajaInscripcion = async ({ clubId, inscripcionId, requestingUserId, body }) => {
  if (!UUID_REGEX.test(inscripcionId)) throw new ValidationError('El id de inscripción es inválido.');
  if (!requestingUserId) throw new AuthError('No se pudo identificar al usuario.');

  const motivoRaw = typeof body?.motivo_baja === 'string' ? body.motivo_baja.trim() : '';

  const selectOptions = [
    'id, torneo_id, jugador_id, pareja_id, estado, estado_inscripcion, torneos(id, estado)',
    'id, torneo_id, jugador_id, estado, estado_inscripcion, torneos(id, estado)',
    'id, torneo_id, jugador_id, estado, torneos(id, estado)',
  ];

  let fetchError = null;
  let inscripcion = null;

  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones').select(columns).eq('id', inscripcionId).eq('club_id', clubId).single();
    if (!error) { inscripcion = data; fetchError = null; break; }
    fetchError = error;
    if (error?.code === 'PGRST116') throw new NotFoundError('Inscripción no encontrada.');
    if (!isMissingColumnError(error)) break;
  }

  if (fetchError) {
    logger.error('Error al obtener inscripción para baja:', fetchError);
    throw new InternalError('No se pudo procesar la solicitud de baja.');
  }

  if (String(inscripcion.jugador_id || '') !== String(requestingUserId)) {
    throw new ForbiddenError('No tenés permiso para solicitar baja en esta inscripción.');
  }

  const estadoActual = resolveInscriptionStatusCompat(inscripcion);
  if (estadoActual !== INSCRIPTION_STATUS_APPROVED) {
    throw new ConflictError('Solo se puede solicitar baja de inscripciones aprobadas.');
  }

  const torneo     = Array.isArray(inscripcion?.torneos) ? inscripcion.torneos[0] : inscripcion?.torneos;
  const estadoTorneo = String(torneo?.estado || '').trim().toLowerCase();
  const ESTADOS_BAJA_PERMITIDOS = new Set(['abierto', 'publicado', 'inscripcion', 'activo']);
  if (!ESTADOS_BAJA_PERMITIDOS.has(estadoTorneo)) {
    throw new ConflictError('No se puede solicitar baja cuando el torneo ya está en progreso o finalizado.');
  }

  const payload = {
    estado_inscripcion: INSCRIPTION_STATUS_WITHDRAWAL_PENDING,
    estado:             'pendiente',
    motivo_rechazo:     motivoRaw || null,
  };

  let updateError = null;
  let updatedData = null;

  for (const p of [payload]) {
    const { data, error } = await supabase
      .from('inscripciones').update(p).eq('id', inscripcionId).select().single();
    if (!error) { updatedData = data; updateError = null; break; }
    updateError = error;
    if (!isMissingColumnError(error)) break;
  }

  if (updateError) {
    logger.error('Error al actualizar estado para baja:', updateError);
    throw new InternalError('No se pudo registrar la solicitud de baja.');
  }

  emitPendingInscriptionsUpdated({
    tipo: 'solicitud_baja', torneo_id: inscripcion.torneo_id,
    jugador_id: inscripcion.jugador_id,
    estado_inscripcion: INSCRIPTION_STATUS_WITHDRAWAL_PENDING,
  });

  return {
    message:     'Solicitud de baja registrada correctamente. El administrador la revisará a la brevedad.',
    inscripcion: { ...updatedData, estado_inscripcion: INSCRIPTION_STATUS_WITHDRAWAL_PENDING },
  };
};

module.exports = {
  getInscripcionesWhatsappTemplate,
  updateInscripcionesWhatsappTemplate,
  crearTorneo,
  actualizarTorneo,
  actualizarTorneoCompat,
  actualizarEstadoTorneo,
  obtenerTorneosDisponibles,
  obtenerTodosLosTorneos,
  invalidateTorneosCache,
  listarCompanerosDoblesDisponibles,
  inscribirJugador,
  obtenerInscripcionesPendientesAdmin,
  validarInscripcionAdmin,
  obtenerInscripcionesPorJugador,
  obtenerCanchasDelTorneo,
  obtenerEstadoCanchas,
  solicitarBajaInscripcion,
};
