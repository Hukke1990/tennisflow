const supabase = require('../services/supabase');

// Exportar una función constructora que recibe "io" (la instancia de Socket.io)
module.exports = (io) => {

  const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

  const normalizeCanchaPayload = (body, { partial = false } = {}) => {
    const payload = {};

    if (!partial || body.nombre !== undefined) {
      if (!isNonEmptyString(body.nombre)) {
        return { error: 'El campo nombre es obligatorio.' };
      }
      payload.nombre = body.nombre.trim();
    }

    if (!partial || body.tipo_superficie !== undefined) {
      if (!isNonEmptyString(body.tipo_superficie)) {
        return { error: 'El campo tipo_superficie es obligatorio.' };
      }
      payload.tipo_superficie = body.tipo_superficie.trim();
    }

    if (body.descripcion !== undefined) {
      if (body.descripcion === null) {
        payload.descripcion = null;
      } else if (typeof body.descripcion === 'string') {
        payload.descripcion = body.descripcion.trim();
      } else {
        return { error: 'El campo descripcion debe ser texto.' };
      }
    }

    if (!partial || body.esta_disponible !== undefined) {
      if (body.esta_disponible === undefined) {
        payload.esta_disponible = true;
      } else if (typeof body.esta_disponible === 'boolean') {
        payload.esta_disponible = body.esta_disponible;
      } else {
        return { error: 'El campo esta_disponible debe ser un booleano.' };
      }
    }

    if (partial && Object.keys(payload).length === 0) {
      return { error: 'No hay campos validos para actualizar.' };
    }

    return { payload };
  };
  
  const obtenerCanchas = async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('canchas')
        .select('id, nombre, tipo_superficie, esta_disponible, descripcion')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al obtener canchas:', error);
        return res.status(500).json({ error: 'Error al listar canchas', details: error.message, hint: error.hint });
      }

      res.json(data);
    } catch (err) {
      console.error('Error inesperado:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  };

  const crearCancha = async (req, res) => {
    try {
      const { payload, error: validationError } = normalizeCanchaPayload(req.body, { partial: false });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const { data, error } = await supabase
        .from('canchas')
        .insert([payload])
        .select('id, nombre, tipo_superficie, esta_disponible, descripcion')
        .single();

      if (error) {
        console.error('Error al crear cancha:', error);
        return res.status(500).json({ error: 'Error al crear cancha', details: error.message });
      }

      return res.status(201).json({ message: 'Cancha creada correctamente.', cancha: data });
    } catch (err) {
      console.error('Error inesperado al crear cancha:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  };

  const actualizarCancha = async (req, res) => {
    try {
      const { id } = req.params;
      const { payload, error: validationError } = normalizeCanchaPayload(req.body, { partial: true });

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const { data, error } = await supabase
        .from('canchas')
        .update(payload)
        .eq('id', id)
        .select('id, nombre, tipo_superficie, esta_disponible, descripcion')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Cancha no encontrada.' });
        }
        console.error('Error al actualizar cancha:', error);
        return res.status(500).json({ error: 'Error al actualizar cancha', details: error.message });
      }

      if (io) {
        io.emit('cancha_actualizada', data);
      }

      return res.json({ message: 'Cancha actualizada correctamente.', cancha: data });
    } catch (err) {
      console.error('Error inesperado al actualizar cancha:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  };

  const eliminarCancha = async (req, res) => {
    try {
      const { id } = req.params;

      const { data: canchaExistente, error: findError } = await supabase
        .from('canchas')
        .select('id')
        .eq('id', id)
        .single();

      if (findError || !canchaExistente) {
        return res.status(404).json({ error: 'Cancha no encontrada.' });
      }

      const { error } = await supabase
        .from('canchas')
        .delete()
        .eq('id', id);

      if (error) {
        if (error.code === '23503') {
          return res.status(409).json({
            error: 'No se puede eliminar la cancha porque esta asociada a torneos o partidos.',
          });
        }

        console.error('Error al eliminar cancha:', error);
        return res.status(500).json({ error: 'Error al eliminar cancha', details: error.message });
      }

      if (io) {
        io.emit('cancha_eliminada', { id });
      }

      return res.json({ message: 'Cancha eliminada correctamente.' });
    } catch (err) {
      console.error('Error inesperado al eliminar cancha:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  };

  const actualizarEstadoCancha = async (req, res) => {
    try {
      const { id } = req.params;
      const { esta_disponible } = req.body; // true = disponible, false = ocupada/mantenimiento

      if (typeof esta_disponible !== 'boolean') {
        return res.status(400).json({ error: 'El campo esta_disponible debe ser un booleano' });
      }

      const { data, error } = await supabase
        .from('canchas')
        .update({ esta_disponible })
        .eq('id', id)
        .select();

      if (error || data.length === 0) {
        console.error('Error al actualizar cancha:', error);
        return res.status(404).json({ error: 'Cancha no encontrada o error al actualizar' });
      }

      const canchaActualizada = data[0];

      // Emitir evento en tiempo real con Socket.io
      if (io) {
        io.emit('estado_cancha_cambiado', canchaActualizada);
      }

      res.json({ message: 'Estado de la cancha actualizado', cancha: canchaActualizada });
    } catch (err) {
      console.error('Error inesperado:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  };

  return {
    obtenerCanchas,
    crearCancha,
    actualizarCancha,
    eliminarCancha,
    actualizarEstadoCancha
  };
};
