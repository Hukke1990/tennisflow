const supabase = require('../services/supabase');

const obtenerPerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const actualizarPerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_completo,
      apellido,
      localidad,
      foto_url,
      mano_dominante,
      estilo_reves,
      altura,
      peso,
      categoria,
    } = req.body;

    const camposPermitidos = {};
    if (nombre_completo !== undefined) camposPermitidos.nombre_completo = nombre_completo;
    if (apellido !== undefined) camposPermitidos.apellido = apellido;
    if (localidad !== undefined) camposPermitidos.localidad = localidad;
    if (foto_url !== undefined) camposPermitidos.foto_url = foto_url;
    if (mano_dominante !== undefined) camposPermitidos.mano_dominante = mano_dominante;
    if (estilo_reves !== undefined) camposPermitidos.estilo_reves = estilo_reves;
    if (altura !== undefined) camposPermitidos.altura = altura ? parseInt(altura) : null;
    if (peso !== undefined) camposPermitidos.peso = peso ? parseInt(peso) : null;
    if (categoria !== undefined) camposPermitidos.categoria = parseInt(categoria);

    const { data, error } = await supabase
      .from('perfiles')
      .update(camposPermitidos)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar perfil:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Perfil actualizado correctamente', perfil: data });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { obtenerPerfil, actualizarPerfil };
