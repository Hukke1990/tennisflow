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

const normalizeTournamentState = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
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
  const payload = {
    titulo: typeof body.titulo === 'string' ? body.titulo.trim() : body.titulo,
    cupos_max: Number(body.cupos_max),
    costo: body.costo === undefined || body.costo === null || body.costo === '' ? 0 : Number(body.costo),
    fecha_inicio: body.fecha_inicio,
    fecha_fin: body.fecha_fin,
    fecha_inicio_inscripcion: body.fecha_inicio_inscripcion,
    fecha_cierre_inscripcion: body.fecha_cierre_inscripcion,
  };

  if (body.estado !== undefined) {
    payload.estado = normalizeTournamentState(body.estado);
  }

  return payload;
};

const formatTournamentListItem = (torneo) => {
  const inscritosCount = Number(torneo.inscripciones?.[0]?.count || 0);
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
      .select('id, titulo, cupos_max, costo, estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion')
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
      .select('cupos_max, estado, fecha_inicio, fecha_fin, fecha_inicio_inscripcion, fecha_cierre_inscripcion')
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


module.exports = {
  crearTorneo,
  actualizarTorneo,
  obtenerTorneosDisponibles,
  obtenerTodosLosTorneos,
  inscribirJugador
};
