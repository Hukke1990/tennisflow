const supabase = require('../services/supabase');

const crearTorneo = async (req, res) => {
  try {
    const { titulo, cupos_max, costo, fecha_inicio, fecha_cierre_inscripcion } = req.body;

    // Validación básica
    if (!titulo || !cupos_max || !fecha_inicio) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const payload = {
      titulo,
      cupos_max,
      costo: costo || 0,
      fecha_inicio,
    };

    if (fecha_cierre_inscripcion && fecha_cierre_inscripcion.trim() !== '') {
      payload.fecha_cierre_inscripcion = fecha_cierre_inscripcion;
    }

    const { data, error } = await supabase
      .from('torneos')
      .insert([payload])
      .select();

    if (error) {
      console.error('Error al crear torneo:', error);
      return res.status(500).json({ error: 'Error al crear el torneo', details: error.message, code: error.code });
    }

    res.status(201).json({ message: 'Torneo creado con éxito', torneo: data[0] });

  } catch (err) {
    console.error('Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ... (código existente) ...

const obtenerTorneosDisponibles = async (req, res) => {
  try {
    const ahora = new Date().toISOString();

    // Obtener torneos activos cuya fecha_cierre_inscripcion no haya pasado (o sea null) 
    // y cuya fecha_inicio sea en el futuro.
    const { data: torneos, error } = await supabase
      .from('torneos')
      .select(`
        *,
        inscripciones ( count ) 
      `)
      .in('estado', ['inscripcion', 'borrador'])
      .or(`fecha_cierre_inscripcion.gt.${ahora},fecha_cierre_inscripcion.is.null`)
      .gt('fecha_inicio', ahora)
      .order('fecha_inicio', { ascending: true });

    if (error) {
      console.error('Error al obtener torneos disponibles:', error);
      return res.status(500).json({ error: 'Error al listar torneos' });
    }

    // Formatear la respuesta para incluir el conteo fácil de leer
    const torneosFormateados = torneos.map(t => {
      const inscritos = t.inscripciones[0]?.count || 0;
      return {
        ...t,
        inscritos,
        disponible: inscritos < t.cupos_max,
        // Eliminamos el array raw de inscripciones para enviar un JSON limpio
        inscripciones: undefined
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
        *,
        inscripciones ( count ) 
      `)
      .order('fecha_inicio', { ascending: false });

    if (error) {
      console.error('Error al obtener todos los torneos:', error);
      return res.status(500).json({ error: 'Error al listar torneos' });
    }

    // Formatear la respuesta para incluir el conteo fácil de leer
    const torneosFormateados = torneos.map(t => {
      const inscritos = t.inscripciones && t.inscripciones.length > 0 ? t.inscripciones[0].count : 0;
      return {
        ...t,
        inscritos,
        disponible: true,
        inscripciones: undefined
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
    const { id: torneo_id } = req.params;
    const { jugador_id, disponibilidad } = req.body;

    if (!jugador_id) {
      return res.status(400).json({ error: 'Falta el ID del jugador' });
    }

    // 1. Verificar torneo
    const { data: torneoInfo, error: torneoError } = await supabase
      .from('torneos')
      .select('cupos_max, estado, fecha_cierre_inscripcion')
      .eq('id', torneo_id)
      .single();

    if (torneoError || !torneoInfo) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    if (torneoInfo.estado !== 'inscripcion') {
      return res.status(400).json({ error: 'El periodo de inscripción para este torneo ya no está activo' });
    }

    if (torneoInfo.fecha_cierre_inscripcion && new Date(torneoInfo.fecha_cierre_inscripcion) < new Date()) {
      return res.status(400).json({ error: 'La fecha de cierre de inscripción ha pasado' });
    }

    // 2. Contar inscritos actuales
    const { count, error: countError } = await supabase
      .from('inscripciones')
      .select('*', { count: 'exact', head: true })
      .eq('torneo_id', torneo_id)
      .eq('estado', 'confirmada');

    if (countError) {
      return res.status(500).json({ error: 'Error al verificar cupos disponibles' });
    }

    // 3. Determinar estado de la inscripción
    const estaLleno = count >= torneoInfo.cupos_max;
    const estadoInscripcion = estaLleno ? 'lista_espera' : 'confirmada';

    // 4. Insertar la inscripción
    const { data: inscripcion, error: insertError } = await supabase
      .from('inscripciones')
      .insert([{ torneo_id, jugador_id, estado: estadoInscripcion, pago_confirmado: true }])
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(400).json({ error: 'El jugador ya está inscrito o en lista de espera en este torneo' });
      }
      console.error('Error al inscribir:', insertError);
      return res.status(500).json({ error: 'Error al procesar la inscripción' });
    }

    // 5. Guardar franjas horarias si se proporcionaron
    if (disponibilidad && Array.isArray(disponibilidad) && disponibilidad.length > 0) {
      // Validar estructura básica
      const franjas_validas = disponibilidad.filter(f =>
        f.dia_semana !== undefined && f.hora_inicio && f.hora_fin && f.hora_inicio < f.hora_fin
      );

      if (franjas_validas.length > 0) {
        // Eliminar disponibilidad previa del jugador para este torneo
        await supabase
          .from('disponibilidad_jugador')
          .delete()
          .eq('jugador_id', jugador_id)
          .eq('torneo_id', torneo_id);

        // Insertar nuevas franjas
        const franjas_a_insertar = franjas_validas.map(f => ({
          jugador_id,
          torneo_id,
          dia_semana: parseInt(f.dia_semana),
          hora_inicio: f.hora_inicio,
          hora_fin: f.hora_fin,
        }));

        const { error: dispError } = await supabase
          .from('disponibilidad_jugador')
          .insert(franjas_a_insertar);

        if (dispError) {
          console.error('Error al guardar disponibilidad:', dispError.message);
          // No fallar la inscripción por esto, solo loggear
        }
      }
    }

    res.status(201).json({
      message: estaLleno
        ? 'Torneo lleno. Has sido añadido a la lista de espera.'
        : 'Inscripción confirmada exitosamente.',
      inscripcion,
      estado: estadoInscripcion
    });

  } catch (err) {
    console.error('Error inesperado en inscripción:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};


module.exports = {
  crearTorneo,
  obtenerTorneosDisponibles,
  obtenerTodosLosTorneos,
  inscribirJugador
};
