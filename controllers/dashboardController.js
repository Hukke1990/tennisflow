'use strict';
const dashboardService = require('../services/dashboardService');
const { handleError }  = require('../utils/errors');
const logger           = require('../services/logger');
const { trackEvent }   = require('../utils/analytics');

const INSCRIBIBLE_STATES = new Set(['publicado', 'abierto']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set(['admin', 'super_admin']);

const resolveClubIdFromRequest = (req) => {
  const rawClubId = req.query?.club_id ?? req.headers?.['x-club-id'];
  const clubId = String(rawClubId || '').trim();

  if (!clubId) {
    return { clubId: null, error: 'club_id es obligatorio.' };
  }

  if (!UUID_REGEX.test(clubId)) {
    return { clubId: null, error: 'club_id debe ser un UUID valido.' };
  }

  return { clubId, error: null };
};

const isMissingColumnError = (error) => {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
};

const fetchPerfilCompat = async (jugadorId, clubId) => {
  const selectOptions = [
    'categoria, ranking_elo, ranking_elo_singles, ranking_elo_dobles',
    'categoria, ranking_elo_singles, ranking_elo_dobles',
    'categoria, ranking_elo',
    'categoria',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .eq('id', jugadorId)
      .eq('club_id', clubId)
      .single();

    if (!error) {
      return { data, error: null };
    }

    if (error?.code === 'PGRST116') {
      return { data: null, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      break;
    }
  }

  return { data: null, error: lastError };
};

const fetchRankingCompat = async (clubId) => {
  const selectOptions = [
    'id, nombre_completo, ranking_elo, ranking_elo_singles, ranking_elo_dobles, categoria, foto_url, rol, es_admin',
    'id, nombre_completo, ranking_elo_singles, ranking_elo_dobles, categoria, foto_url, rol, es_admin',
    'id, nombre_completo, ranking_elo, ranking_elo_singles, ranking_elo_dobles, categoria, foto_url, rol',
    'id, nombre_completo, ranking_elo_singles, ranking_elo_dobles, categoria, foto_url, rol',
    'id, nombre_completo, ranking_elo, ranking_elo_singles, ranking_elo_dobles, categoria, foto_url',
    'id, nombre_completo, ranking_elo_singles, ranking_elo_dobles, categoria, foto_url',
    'id, nombre_completo, ranking_elo, categoria, foto_url',
    'id, nombre_completo, ranking_elo_singles, categoria, foto_url',
    'id, nombre_completo, ranking_elo_dobles, categoria, foto_url',
    'id, nombre_completo, ranking_elo, categoria',
    'id, nombre_completo, ranking_elo_singles, categoria',
    'id, nombre_completo, ranking_elo_dobles, categoria',
    'id, nombre_completo, categoria',
    'id, nombre_completo',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .eq('club_id', clubId)
      .not('rol', 'in', '("admin","super_admin")')
      .limit(200);

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      // Si el error NO es de columna faltante (ej: la columna rol no existe aun),
      // intentar sin filtro de rol como fallback de último recurso.
      break;
    }
  }

  // Fallback sin filtro de rol en DB
  for (const columns of selectOptions.slice(-4)) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .eq('club_id', clubId)
      .limit(200);

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { data: [], error: lastError };
};

const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'superadmin' || normalized === 'super_admin') return 'super_admin';
  if (normalized === 'admin' || normalized === 'administrador') return 'admin';
  if (normalized === 'jugador' || normalized === 'player') return 'jugador';
  return '';
};

const fetchAdminProfileIdsCompat = async (clubId) => {
  const selectOptions = [
    'id, rol, es_admin',
    'id, es_admin',
    'id, rol',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .eq('club_id', clubId);

    if (!error) {
      const adminIds = new Set(
        (data || [])
          .filter((perfil) => {
            const role = normalizeRole(perfil?.rol);
            return ADMIN_ROLES.has(role) || perfil?.es_admin === true;
          })
          .map((perfil) => String(perfil?.id || '').trim())
          .filter(Boolean)
      );

      return { adminIds, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { adminIds: new Set(), error: lastError };
};

const resolveRankingValue = (perfil = {}) => {
  const value = Number(
    perfil.ranking_elo
    ?? perfil.ranking_elo_singles
    ?? perfil.ranking_elo_dobles
    ?? 0,
  );

  return Number.isFinite(value) ? value : 0;
};

const normalizeTournamentState = (value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return normalized === 'inscripcion' ? 'publicado' : normalized;
};

const parseDateSafe = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeInscriptionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'approved' || normalized === 'aprobar') return 'aprobada';
  return normalized;
};

const normalizeLegacyInscriptionState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'confirmada') return 'confirmada';
  return normalized;
};

const isApprovedInscription = (row = {}) => {
  const status = normalizeInscriptionStatus(row.estado_inscripcion);
  if (status) {
    return status === 'aprobada';
  }

  return normalizeLegacyInscriptionState(row.estado) === 'confirmada';
};

const fetchApprovedCountByTournamentCompat = async (torneoIds = [], clubId) => {
  const normalizedIds = [...new Set((torneoIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return { countsByTournament: new Map(), error: null };
  }

  const selectOptions = [
    'torneo_id, estado, estado_inscripcion',
    'torneo_id, estado',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones')
      .select(columns)
      .eq('club_id', clubId)
      .in('torneo_id', normalizedIds);

    if (!error) {
      const countsByTournament = new Map();
      for (const row of (data || [])) {
        if (!isApprovedInscription(row)) continue;

        const torneoId = String(row?.torneo_id || '').trim();
        if (!torneoId) continue;

        countsByTournament.set(torneoId, (countsByTournament.get(torneoId) || 0) + 1);
      }

      return { countsByTournament, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      break;
    }
  }

  return { countsByTournament: new Map(), error: lastError };
};

const getDashboard = async (req, res) => {
  try {
    const rawClubId = req.query?.club_id ?? req.headers?.['x-club-id'];
    const clubId    = String(rawClubId || '').trim();
    const jugadorId = String(req.query?.jugador_id || '').trim() || undefined;
    const data      = await dashboardService.getDashboard({ clubId, jugadorId });

    // Analytics: vista de dashboard (fire-and-forget)
    if (clubId) trackEvent('dashboard_view', { club_id: clubId, user_id: req.authUser?.id }).catch(() => {});

    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

module.exports = { getDashboard };


