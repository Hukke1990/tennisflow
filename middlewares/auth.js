const supabase = require('../services/supabase');

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

const normalizeRole = (value) => {
  if (value === true) return 'admin';
  if (value === false || value === null || value === undefined || value === '') return '';

  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'superadmin') return 'super_admin';
  if (normalized === 'super_admin') return 'super_admin';
  if (normalized === 'admin' || normalized === 'administrador') return 'admin';
  if (normalized === 'jugador' || normalized === 'player') return 'jugador';
  return '';
};

const extractBearerToken = (req) => {
  const rawHeader = req.headers.authorization || req.headers.Authorization;
  if (!rawHeader || typeof rawHeader !== 'string') return '';

  const match = /^Bearer\s+(.+)$/i.exec(rawHeader.trim());
  if (!match) return '';
  return match[1].trim();
};

const resolveProfileRole = async (userId) => {
  if (!userId) return '';

  try {
    const { data } = await supabase
      .from('perfiles')
      .select('rol, es_admin')
      .eq('id', userId)
      .single();

    const roleByEnum = normalizeRole(data?.rol);
    if (roleByEnum) return roleByEnum;

    const roleByLegacyFlag = normalizeRole(data?.es_admin);
    if (roleByLegacyFlag) return roleByLegacyFlag;

    return '';
  } catch (_) {
    return '';
  }
};

const requireAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticacion requerido.' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) {
      return res.status(401).json({ error: 'Token invalido o expirado.' });
    }

    const authUser = data.user;
    const profileRole = await resolveProfileRole(authUser.id);
    const metadataRole = normalizeRole(authUser?.user_metadata?.rol || authUser?.user_metadata?.role);

    req.authUser = {
      id: authUser.id,
      email: authUser.email || '',
      rol: profileRole || metadataRole || 'jugador',
      raw: authUser,
    };

    return next();
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo validar la autenticacion.' });
  }
};

const requireRole = (allowedRoles = []) => {
  const normalizedAllowed = new Set((allowedRoles || []).map((role) => normalizeRole(role)));

  return (req, res, next) => {
    const currentRole = normalizeRole(req.authUser?.rol) || 'jugador';
    if (normalizedAllowed.has(currentRole)) {
      return next();
    }

    return res.status(403).json({ error: 'No tienes permisos para realizar esta accion.' });
  };
};

const requireAdmin = requireRole(['admin', 'super_admin']);

const requireSelfOrRole = ({
  paramName = 'id',
  allowedRoles = ['admin', 'super_admin'],
} = {}) => {
  const normalizedAllowed = new Set((allowedRoles || []).map((role) => normalizeRole(role)));

  return (req, res, next) => {
    const authId = String(req.authUser?.id || '').trim();
    const targetId = String(req.params?.[paramName] || '').trim();
    const currentRole = normalizeRole(req.authUser?.rol) || 'jugador';

    if (normalizedAllowed.has(currentRole)) {
      return next();
    }

    if (authId && targetId && authId === targetId) {
      return next();
    }

    return res.status(403).json({ error: 'No tienes permisos para modificar este recurso.' });
  };
};

const enforceJugadorIdForSelfOrAdmin = ({
  bodyField = 'jugador_id',
  allowedRoles = ['admin', 'super_admin'],
} = {}) => {
  const normalizedAllowed = new Set((allowedRoles || []).map((role) => normalizeRole(role)));

  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      req.body = {};
    }

    const authId = String(req.authUser?.id || '').trim();
    const currentRole = normalizeRole(req.authUser?.rol) || 'jugador';
    const requestedId = String(req.body?.[bodyField] || '').trim();

    if (!authId) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }

    if (normalizedAllowed.has(currentRole)) {
      if (!requestedId) {
        req.body[bodyField] = authId;
      }
      return next();
    }

    if (requestedId && requestedId !== authId) {
      return res.status(403).json({ error: 'No puedes operar sobre otro jugador.' });
    }

    req.body[bodyField] = authId;
    return next();
  };
};

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  requireSelfOrRole,
  enforceJugadorIdForSelfOrAdmin,
};
