'use strict';

/**
 * services/dashboardService.js
 *
 * Lógica de negocio para el dashboard del club.
 * Sin acceso a req/res — eso es responsabilidad del controller.
 */

const supabase = require('./supabase');
const logger   = require('./logger');
const cache    = require('../utils/cache');
const { ValidationError, InternalError } = require('../utils/errors');

const INSCRIBIBLE_STATES = new Set(['publicado', 'abierto']);
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── Helpers de compatibilidad (compat layer para esquemas DB antiguos) ───────

const isMissingColumnError = (error) =>
  error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');

const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'superadmin' || normalized === 'super_admin') return 'super_admin';
  if (normalized === 'admin' || normalized === 'administrador') return 'admin';
  if (normalized === 'jugador' || normalized === 'player') return 'jugador';
  return '';
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
  if (status) return status === 'aprobada';
  return normalizeLegacyInscriptionState(row.estado) === 'confirmada';
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

    if (!error) return { data, error: null };
    if (error?.code === 'PGRST116') return { data: null, error: null };

    lastError = error;
    if (!isMissingColumnError(error)) break;
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

    if (!error) return { data: data || [], error: null };

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  // Fallback sin filtro de rol en DB
  for (const columns of selectOptions.slice(-4)) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .eq('club_id', clubId)
      .limit(200);

    if (!error) return { data: data || [], error: null };

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { data: [], error: lastError };
};

const fetchAdminProfileIdsCompat = async (clubId) => {
  const selectOptions = ['id, rol, es_admin', 'id, es_admin', 'id, rol'];
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
          .filter(Boolean),
      );
      return { adminIds, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { adminIds: new Set(), error: lastError };
};

const fetchApprovedCountByTournamentCompat = async (torneoIds = [], clubId) => {
  const normalizedIds = [...new Set((torneoIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (normalizedIds.length === 0) return { countsByTournament: new Map(), error: null };

  const selectOptions = ['torneo_id, estado, estado_inscripcion', 'torneo_id, estado'];
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
    if (!isMissingColumnError(error)) break;
  }

  return { countsByTournament: new Map(), error: lastError };
};

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Devuelve los datos del dashboard del club.
 * @param {{ clubId: string, jugadorId?: string }} params
 */
const getDashboard = async ({ clubId, jugadorId }) => {
  if (!clubId) throw new ValidationError('club_id es obligatorio.');

  // El dashboard de un jugador específico varía por jugadorId.
  // Las estadísticas globales se cachean por clubId (TTL=15s).
  const jugadorIdNorm     = String(jugadorId || '').trim();
  const jugadorIdValido   = UUID_REGEX.test(jugadorIdNorm);

  // Cache key incluye jugadorId si es válido (para sección personal)
  const cacheKey = `dashboard:${clubId}:${jugadorIdValido ? jugadorIdNorm : 'anon'}`;
  return cache.getOrFetch(cacheKey, cache.TTL.DASHBOARD, () =>
    _fetchDashboard({ clubId, jugadorId: jugadorIdNorm, jugadorIdValido }),
  );
};

const _fetchDashboard = async ({ clubId, jugadorId: jugadorIdNormalizado, jugadorIdValido }) => {
  const _t0 = Date.now();
  // Paralelizar stats globales + torneos disponibles (son independientes)
  const [jugadoresCountRes, torneosFinalizadosRes] = await Promise.all([
    supabase.from('perfiles').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
    supabase.from('torneos').select('id').eq('club_id', clubId).eq('estado', 'finalizado'),
  ]);

  if (jugadoresCountRes.error) throw jugadoresCountRes.error;
  if (torneosFinalizadosRes.error) throw torneosFinalizadosRes.error;

  const torneosFinalizadosIds = (torneosFinalizadosRes.data || [])
    .map((row) => String(row?.id || '').trim())
    .filter(Boolean);

  let total_partidos_jugados = 0;
  if (torneosFinalizadosIds.length > 0) {
    const partidosCountRes = await supabase
      .from('partidos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'finalizado')
      .in('torneo_id', torneosFinalizadosIds);

    if (partidosCountRes.error) throw partidosCountRes.error;
    total_partidos_jugados = partidosCountRes.count || 0;
  }

  const estadisticas_globales = {
    total_jugadores:        jugadoresCountRes.count || 0,
    torneos_realizados:     torneosFinalizadosIds.length,
    partidos_jugados:       total_partidos_jugados,
  };

  // ── 1. Próximos torneos abiertos ──────────────────────────────────────────
  const { data: torneos_raw, error: e1 } = await supabase
    .from('torneos')
    .select('id, titulo, fecha_inicio, fecha_inicio_inscripcion, fecha_cierre_inscripcion, costo, estado')
    .eq('club_id', clubId)
    .in('estado', ['publicado', 'abierto', 'inscripcion'])
    .order('fecha_inicio', { ascending: true })
    .limit(50);

  if (e1) throw e1;

  const ahora = new Date();
  const torneosFiltrados = (torneos_raw || [])
    .filter((t) => {
      const estadoNormalizado = normalizeTournamentState(t.estado);
      if (!INSCRIBIBLE_STATES.has(estadoNormalizado)) return false;

      const inicioInscripcion = parseDateSafe(t.fecha_inicio_inscripcion);
      const cierreInscripcion = parseDateSafe(t.fecha_cierre_inscripcion);
      if (!inicioInscripcion || !cierreInscripcion) return false;

      return ahora >= inicioInscripcion && ahora <= cierreInscripcion;
    })
    .slice(0, 3);

  const { countsByTournament, error: approvedCountsError } = await fetchApprovedCountByTournamentCompat(
    torneosFiltrados.map((t) => t.id),
    clubId,
  );
  if (approvedCountsError) throw approvedCountsError;

  const proximos_torneos = torneosFiltrados.map((t) => ({
    ...t,
    inscritos_count: countsByTournament.get(String(t.id || '').trim()) || 0,
  }));

  // ── 2. Últimos 3 torneos finalizados ──────────────────────────────────────
  const { data: torneos_finalizados, error: e2 } = await supabase
    .from('torneos')
    .select('id, titulo, fecha_inicio, estado')
    .eq('club_id', clubId)
    .eq('estado', 'finalizado')
    .order('fecha_inicio', { ascending: false })
    .limit(3);

  if (e2) throw e2;

  // ── 3. Ranking Top 5 por ELO ──────────────────────────────────────────────
  let ranking_top5 = [];
  let categoria_jugador = null;

  if (jugadorIdValido) {
    const { data: perfil, error: perfilError } = await fetchPerfilCompat(jugadorIdNormalizado, clubId);
    if (perfilError && !isMissingColumnError(perfilError)) throw perfilError;
    categoria_jugador = perfil?.categoria ?? null;
  }

  const { data: rankingData, error: e3 } = await fetchRankingCompat(clubId);
  if (e3) throw e3;

  const { adminIds, error: adminFilterError } = await fetchAdminProfileIdsCompat(clubId);
  if (adminFilterError) {
    logger.warn('No se pudo resolver filtro de admins en dashboard ranking:', adminFilterError?.message || adminFilterError);
  }

  const rankingOrdenado = [...(rankingData || [])]
    .filter((j) => {
      if (adminIds.has(String(j?.id || '').trim())) return false;
      const rol = normalizeRole(j?.rol);
      if (ADMIN_ROLES.has(rol)) return false;
      if (j?.es_admin === true) return false;
      return true;
    })
    .sort((a, b) => resolveRankingValue(b) - resolveRankingValue(a))
    .slice(0, 5);

  ranking_top5 = rankingOrdenado.map((j, idx) => ({
    posicion:        idx + 1,
    id:              j.id,
    nombre_completo: j.nombre_completo,
    ranking_elo:     resolveRankingValue(j),
    categoria:       j.categoria ?? null,
    foto_url:        j.foto_url ?? null,
    es_yo:           j.id === jugadorIdNormalizado,
  }));

  // ── 4. Estadísticas del jugador ───────────────────────────────────────────
  let estadisticas_jugador = null;

  if (jugadorIdValido) {
    let partidos = [];

    if (torneosFinalizadosIds.length > 0) {
      const { data: partidosData, error: partidosError } = await supabase
        .from('partidos')
        .select('jugador1_id, jugador2_id, ganador_id')
        .eq('estado', 'finalizado')
        .in('torneo_id', torneosFinalizadosIds)
        .or(`jugador1_id.eq.${jugadorIdNormalizado},jugador2_id.eq.${jugadorIdNormalizado}`);

      if (partidosError) throw partidosError;
      partidos = partidosData || [];
    }

    let victorias = 0;
    let derrotas  = 0;
    const h2h     = {};

    for (const p of partidos) {
      if (!p.ganador_id) continue;
      const rival_id = p.jugador1_id === jugadorIdNormalizado ? p.jugador2_id : p.jugador1_id;
      const gano = p.ganador_id === jugadorIdNormalizado;
      if (gano) victorias++; else derrotas++;
      if (rival_id) {
        if (!h2h[rival_id]) h2h[rival_id] = { victorias: 0, derrotas: 0 };
        if (gano) h2h[rival_id].victorias++; else h2h[rival_id].derrotas++;
      }
    }

    estadisticas_jugador = {
      jugador_id:    jugadorIdNormalizado,
      victorias,
      derrotas,
      total_partidos: victorias + derrotas,
      win_rate:       victorias + derrotas > 0
        ? Math.round((victorias / (victorias + derrotas)) * 100)
        : 0,
      h2h,
    };
  }

  const _dash_dur = Date.now() - _t0;
  if (_dash_dur > 500) logger.warn('slow_query', { query: 'fetchDashboard', club_id: clubId, duration_ms: _dash_dur });

  return {
    estadisticas_globales,
    proximos_torneos,
    torneos_finalizados: torneos_finalizados || [],
    ranking_top5,
    categoria_ranking:   categoria_jugador,
    estadisticas_jugador,
  };
};

/**
 * Invalida el cache del dashboard de un club.
 * @param {string} clubId
 */
const invalidateDashboardCache = (clubId) => invalidateClub(clubId);

module.exports = { getDashboard, invalidateDashboardCache };
