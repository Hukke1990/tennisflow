const supabase = require('../services/supabase');

// Exportar una función constructora que recibe "io" (la instancia de Socket.io)
module.exports = (io) => {
  
  const obtenerCanchas = async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('canchas')
        .select('*')
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
    actualizarEstadoCancha
  };
};
