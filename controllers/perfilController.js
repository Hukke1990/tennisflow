const supabase = require('../services/supabase');

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'superadmin' || normalized === 'super_admin') return 'super_admin';
  if (normalized === 'admin' || normalized === 'administrador') return 'admin';
  if (normalized === 'jugador' || normalized === 'player') return 'jugador';
  return '';
};

const parseCategoria = (rawValue, fieldName) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { value: null, error: null };
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return { value: null, error: `${fieldName} debe ser un numero entre 1 y 5.` };
  }

  return { value: parsed, error: null };
};

const normalizeTelefono = (rawValue) => {
  const value = String(rawValue ?? '').trim();
  if (!value) {
    return { value: '', error: 'telefono es obligatorio.' };
  }

  if (!INTERNATIONAL_PHONE_REGEX.test(value)) {
    return { value: '', error: 'telefono debe tener formato internacional. Ejemplo: +5491122334455' };
  }

  return { value, error: null };
};

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
      telefono,
      categoria,
      categoria_singles,
      categoria_dobles,
    } = req.body;

    const currentRole = normalizeRole(req.authUser?.rol);
    const canEditCategorias = ADMIN_ROLES.has(currentRole);
    const wantsToEditCategorias = (
      categoria !== undefined
      || categoria_singles !== undefined
      || categoria_dobles !== undefined
    );

    if (wantsToEditCategorias && !canEditCategorias) {
      return res.status(403).json({ error: 'Solo admin o super_admin pueden editar categorias.' });
    }

    const camposPermitidos = {};
    if (nombre_completo !== undefined) camposPermitidos.nombre_completo = nombre_completo;
    if (apellido !== undefined) camposPermitidos.apellido = apellido;
    if (localidad !== undefined) camposPermitidos.localidad = localidad;
    if (foto_url !== undefined) camposPermitidos.foto_url = foto_url;
    if (mano_dominante !== undefined) camposPermitidos.mano_dominante = mano_dominante;
    if (estilo_reves !== undefined) camposPermitidos.estilo_reves = estilo_reves;
    if (altura !== undefined) camposPermitidos.altura = altura ? parseInt(altura) : null;
    if (peso !== undefined) camposPermitidos.peso = peso ? parseInt(peso) : null;

    if (telefono !== undefined) {
      const { value, error } = normalizeTelefono(telefono);
      if (error) return res.status(400).json({ error });
      camposPermitidos.telefono = value;
    }

    if (categoria !== undefined) {
      const { value, error } = parseCategoria(categoria, 'categoria');
      if (error) return res.status(400).json({ error });
      camposPermitidos.categoria = value;
    }

    if (categoria_singles !== undefined) {
      const { value, error } = parseCategoria(categoria_singles, 'categoria_singles');
      if (error) return res.status(400).json({ error });
      camposPermitidos.categoria_singles = value;
    }

    if (categoria_dobles !== undefined) {
      const { value, error } = parseCategoria(categoria_dobles, 'categoria_dobles');
      if (error) return res.status(400).json({ error });
      camposPermitidos.categoria_dobles = value;
    }

    // Compatibilidad: si llega solo categoria_singles y no categoria legacy, sincronizar categoria.
    if (
      canEditCategorias
      && categoria === undefined
      && categoria_singles !== undefined
      && camposPermitidos.categoria_singles !== undefined
    ) {
      camposPermitidos.categoria = camposPermitidos.categoria_singles;
    }

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
