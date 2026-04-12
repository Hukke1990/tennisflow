'use strict';
const torneosService  = require('../services/torneosService');
const { handleError } = require('../utils/errors');
const logger          = require('../services/logger');
const { trackEvent }        = require('../utils/analytics');
const { incrementCounter }  = require('../utils/analyticsCounters');

const resolveClubId = (req) =>
  req.query?.club_id ?? req.headers?.['x-club-id'] ?? null;


const getInscripcionesWhatsappTemplate = async (req, res) => {
  try {
    const data = await torneosService.getInscripcionesWhatsappTemplate();
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const updateInscripcionesWhatsappTemplate = async (req, res) => {
  try {
    const data = await torneosService.updateInscripcionesWhatsappTemplate({
      template: req.body?.template,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const crearTorneo = async (req, res) => {
  try {
    const clubId = resolveClubId(req);
    const data   = await torneosService.crearTorneo({ clubId, body: req.body });

    // Analytics: torneo creado (fire-and-forget)
    trackEvent('torneo_creado', { club_id: clubId, user_id: req.authUser?.id }).catch(() => {});
    incrementCounter(clubId, 'torneos').catch(() => {});

    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const actualizarTorneo = async (req, res) => {
  try {
    const data = await torneosService.actualizarTorneo({
      id:   req.params.id,
      body: req.body,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const actualizarTorneoCompat = async (req, res) => {
  try {
    const data = await torneosService.actualizarTorneoCompat({
      id:   req.params.id,
      body: req.body,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const obtenerTorneosDisponibles = async (req, res) => {
  try {
    const data = await torneosService.obtenerTorneosDisponibles({
      clubId: resolveClubId(req),
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const obtenerTodosLosTorneos = async (req, res) => {
  try {
    const data = await torneosService.obtenerTodosLosTorneos({
      clubId: resolveClubId(req),
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const listarCompanerosDoblesDisponibles = async (req, res) => {
  try {
    const data = await torneosService.listarCompanerosDoblesDisponibles({
      clubId:        resolveClubId(req),
      torneoId:      req.params?.torneoId || req.params?.id,
      jugadorBaseId: req.query?.jugador_id || req.authUser?.id,
      q:             req.query?.q,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
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
      logger.error('Error al verificar inscripcion existente:', existingFetchError);
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
        logger.error('Error al verificar inscripción de la pareja:', inscripcionParejaError);
        return res.status(500).json({ error: 'No se pudo verificar la disponibilidad de la pareja.' });
      }

      if (inscripcionParejaExistente) {
        return res.status(409).json({ error: 'La pareja seleccionada ya tiene una inscripción para este torneo.' });
      }
    }

    const parejaId = torneoEsDobles ? randomUUID() : null;

    // ── Llamada atómica vía RPC ─────────────────────────────────────────────────
    // inscribir_jugador_atomico encapsula en una sola transacción postgres:
    //   A) INSERT inscripciones (titular + pareja si es dobles)
    //   B) DELETE disponibilidad_inscripcion previa
    //   C) INSERT disponibilidad_inscripcion nueva
    // Si cualquier paso falla → ROLLBACK completo, sin estados intermedios.

    // Construir array de franjas para la RPC (incluye jugador_id de titular y pareja)
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
      }))
    );

    const { data: rpcResult, error: rpcError } = await supabase.rpc('inscribir_jugador_atomico', {
      p_club_id:           clubId,
      p_torneo_id:         torneo_id,
      p_jugador_id:        jugador_id,
      p_pareja_jugador_id: torneoEsDobles ? parejaJugadorId : null,
      p_pareja_id:         parejaId,
      p_estado:            mapLegacyStateFromInscriptionStatus(INSCRIPTION_STATUS_PENDING),
      p_estado_inscripcion: INSCRIPTION_STATUS_PENDING,
      p_disponibilidad:    JSON.stringify(disponibilidadRpc),
    });

    if (rpcError) {
      logger.reqError(req, '[inscribir] Error en RPC inscribir_jugador_atomico', rpcError, {
        club_id:   clubId,
        torneo_id,
        jugador_id,
      });
      return res.status(500).json({ error: 'Error al procesar la inscripción' });
    }

    if (!rpcResult?.ok) {
      if (rpcResult?.error_code === '23505') {
        return res.status(409).json({ error: 'Ya existe una solicitud o inscripción para alguno de los jugadores de la pareja.' });
      }
      logger.error('[inscribir] RPC retornó error', {
        club_id:    clubId,
        torneo_id,
        jugador_id,
        error_code: rpcResult?.error_code,
        error_msg:  rpcResult?.error_msg,
      });
      return res.status(500).json({ error: 'Error al procesar la inscripción' });
    }

    emitPendingInscriptionsUpdated({
      tipo:              'nueva_solicitud',
      torneo_id,
      jugador_id,
      pareja_jugador_id: torneoEsDobles ? parejaJugadorId : null,
    });

    // Analytics: inscripción registrada (fire-and-forget)
    trackEvent('jugador_inscripto', { club_id: clubId, torneo_id, user_id: jugador_id }).catch(() => {});
    incrementCounter(clubId, 'inscripciones').catch(() => {});

    return res.status(201).json({
      message: torneoEsDobles
        ? 'La solicitud de la pareja fue enviada y esta siendo revisada por el administrador.'
        : 'Tu solicitud fue enviada. Tu inscripción está siendo revisada por el administrador.',
      inscripcion:           { id: rpcResult.inscripcion_id },
      estado:                mapLegacyStateFromInscriptionStatus(INSCRIPTION_STATUS_PENDING),
      estado_inscripcion:    INSCRIPTION_STATUS_PENDING,
      disponibilidad_guardada: disponibilidadRpc.length,
      pareja_jugador_id:     torneoEsDobles ? parejaJugadorId : null,
      pareja_id:             torneoEsDobles ? parejaId : null,
    });

  } catch (err) {
    logger.error('Error inesperado en inscripción:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const obtenerInscripcionesPendientesAdmin = async (req, res) => {
  try {
    const data = await torneosService.obtenerInscripcionesPendientesAdmin({
      clubId: resolveClubId(req),
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const validarInscripcionAdmin = async (req, res) => {
  try {
    const data = await torneosService.validarInscripcionAdmin({
      clubId:        resolveClubId(req),
      inscripcionId: req.params?.inscripcionId,
      body:          req.body,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const obtenerInscripcionesPorJugador = async (req, res) => {
  try {
    const data = await torneosService.obtenerInscripcionesPorJugador({
      clubId:    resolveClubId(req),
      jugadorId: req.params?.id,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const actualizarEstadoTorneo = async (req, res) => {
  try {
    const data = await torneosService.actualizarEstadoTorneo({
      id:   req.params.id,
      body: req.body,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const obtenerCanchasDelTorneo = async (req, res) => {
  try {
    const data = await torneosService.obtenerCanchasDelTorneo({
      torneoId: req.params.id,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const obtenerEstadoCanchas = async (req, res) => {
  try {
    const data = await torneosService.obtenerEstadoCanchas({
      torneoId: req.params.id,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const solicitarBajaInscripcion = async (req, res) => {
  try {
    const data = await torneosService.solicitarBajaInscripcion({
      clubId:           resolveClubId(req),
      inscripcionId:    req.params?.inscripcionId,
      requestingUserId: req.authUser?.id,
      body:             req.body,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
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
  solicitarBajaInscripcion,
  obtenerInscripcionesPorJugador,
  obtenerCanchasDelTorneo,
  obtenerEstadoCanchas,
  actualizarEstadoTorneo,
};

