const supabase = require('../services/supabase');

const guardarDisponibilidad = async (req, res) => {
  try {
    const { jugador_id, horarios } = req.body;

    if (!jugador_id || !Array.isArray(horarios)) {
      return res.status(400).json({ error: 'Faltan datos requeridos (jugador_id, horarios)' });
    }

    // 1. Borramos la disponibilidad anterior del jugador
    const { error: deleteError } = await supabase
      .from('disponibilidad_jugador')
      .delete()
      .eq('jugador_id', jugador_id);

    if (deleteError) {
      console.error('Error al borrar disponibilidad anterior:', deleteError);
      return res.status(500).json({ error: 'Error al limpiar disponibilidad previa' });
    }

    // Si el usuario vació sus horarios, retornamos éxito temprano
    if (horarios.length === 0) {
      return res.json({ message: 'Disponibilidad borrada exitosamente (sin nuevos horarios)' });
    }

    // 2. Preparamos los registros a insertar
    const registrosAInsertar = horarios.map(h => ({
      jugador_id,
      dia_semana: h.dia_semana,
      hora_inicio: h.hora_inicio,
      hora_fin: h.hora_fin
    }));

    // 3. Insertamos los nuevos horarios
    const { data, error: insertError } = await supabase
      .from('disponibilidad_jugador')
      .insert(registrosAInsertar)
      .select();

    if (insertError) {
      console.error('Error al insertar nueva disponibilidad:', insertError);
      return res.status(500).json({ error: 'Error al guardar los nuevos horarios', details: insertError.message, code: insertError.code });
    }

    res.json({ message: 'Disponibilidad guardada exitosamente', data });

  } catch (error) {
    console.error('Error inesperado:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  guardarDisponibilidad
};
