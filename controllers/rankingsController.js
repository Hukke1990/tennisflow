const supabase = require('../services/supabase');

const MODALIDADES = new Set(['Singles', 'Dobles']);
const SEXOS = new Set(['Masculino', 'Femenino']);
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const resolvePointsByModalidad = (jugador = {}, modalidad = 'Singles') => {
  const value = modalidad === 'Dobles'
    ? Number(jugador.ranking_puntos_dobles ?? jugador.ranking_puntos ?? 0)
    : Number(jugador.ranking_puntos_singles ?? jugador.ranking_puntos ?? 0);

  return Number.isFinite(value) ? value : 0;
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

const fetchTournamentWinsByPlayers = async (playerIds = [], clubTournamentIds = []) => {
  if (!Array.isArray(playerIds) || playerIds.length === 0 || !Array.isArray(clubTournamentIds) || clubTournamentIds.length === 0) {
    return { winsByPlayer: new Map(), error: null };
  }

  const queryOptions = [
    { column: 'ronda_orden', value: 2 },
    { column: 'ronda', value: 'Final' },
  ];

  let lastError = null;
  for (const option of queryOptions) {
    const { data, error } = await supabase
      .from('partidos')
      .select('ganador_id, torneo_id')
      .eq('estado', 'finalizado')
      .eq(option.column, option.value)
      .in('torneo_id', clubTournamentIds)
      .in('ganador_id', playerIds);

    if (!error) {
      const byPlayerTournament = new Map();

      for (const row of (data || [])) {
        const playerId = String(row?.ganador_id || '').trim();
        const tournamentId = String(row?.torneo_id || '').trim();
        if (!playerId || !tournamentId) continue;

        if (!byPlayerTournament.has(playerId)) {
          byPlayerTournament.set(playerId, new Set());
        }
        byPlayerTournament.get(playerId).add(tournamentId);
      }

      const winsByPlayer = new Map();
      for (const [playerId, tournamentSet] of byPlayerTournament.entries()) {
        winsByPlayer.set(playerId, tournamentSet.size);
      }

      return { winsByPlayer, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { winsByPlayer: new Map(), error: lastError };
};

const fetchRankingsCompat = async ({ sexo, categoriaField, categoria, clubId }) => {
  const selectOptions = [
    'id, nombre_completo, foto_url, sexo, categoria, categoria_singles, categoria_dobles, ranking_puntos, ranking_puntos_singles, ranking_puntos_dobles, ranking_elo_singles, ranking_elo_dobles',
    'id, nombre_completo, foto_url, sexo, categoria, categoria_singles, categoria_dobles, ranking_puntos, ranking_puntos_singles, ranking_puntos_dobles',
    'id, nombre_completo, foto_url, sexo, categoria, categoria_singles, categoria_dobles',
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('perfiles')
      .select(columns)
      .eq('club_id', clubId)
      .eq('sexo', sexo)
      .eq(categoriaField, categoria)
      .not('nombre_completo', 'is', null);

    if (!error) {
      return { data: data || [], error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { data: [], error: lastError };
};

const fetchClubTournamentIds = async (clubId) => {
  const { data, error } = await supabase
    .from('torneos')
    .select('id')
    .eq('club_id', clubId);

  if (error) {
    return { ids: [], error };
  }

  const ids = (data || [])
    .map((row) => String(row?.id || '').trim())
    .filter(Boolean);

  return { ids, error: null };
};

const fetchUsualPartnersForDobles = async (playerIds = [], clubId) => {
  if (playerIds.length === 0) return { partnersByPlayer: new Map(), error: null };

  // Get Dobles tournament IDs for this club
  const { data: doblesTorneos, error: torneoError } = await supabase
    .from('torneos')
    .select('id')
    .eq('club_id', clubId)
    .ilike('modalidad', 'Dobles');

  if (torneoError) return { partnersByPlayer: new Map(), error: torneoError };

  const doblesTorneoIds = (doblesTorneos || []).map((t) => String(t?.id || '').trim()).filter(Boolean);
  if (doblesTorneoIds.length === 0) return { partnersByPlayer: new Map(), error: null };

  // Query inscriptions with partner names (compat: try with join first, then without)
  const selectOptions = [
    'jugador_id, pareja_jugador_id, pareja_perfil:perfiles!inscripciones_pareja_jugador_fk(id, nombre_completo)',
    'jugador_id, pareja_jugador_id',
  ];

  let lastError = null;
  for (const cols of selectOptions) {
    const { data, error } = await supabase
      .from('inscripciones')
      .select(cols)
      .eq('club_id', clubId)
      .in('torneo_id', doblesTorneoIds)
      .in('jugador_id', playerIds)
      .not('pareja_jugador_id', 'is', null);

    if (!error) {
      const partnerCounts = new Map(); // playerId -> Map<partnerId, count>
      const partnerNames = new Map(); // partnerId -> nombre

      for (const row of (data || [])) {
        const jugadorId = String(row?.jugador_id || '').trim();
        const parejaId = String(row?.pareja_jugador_id || '').trim();
        if (!jugadorId || !parejaId) continue;

        if (row.pareja_perfil?.nombre_completo) {
          partnerNames.set(parejaId, row.pareja_perfil.nombre_completo);
        }

        if (!partnerCounts.has(jugadorId)) partnerCounts.set(jugadorId, new Map());
        const counts = partnerCounts.get(jugadorId);
        counts.set(parejaId, (counts.get(parejaId) || 0) + 1);
      }

      const partnersByPlayer = new Map();
      for (const [playerId, counts] of partnerCounts.entries()) {
        let maxPartnerId = null;
        let maxCount = 0;
        for (const [partnerId, count] of counts.entries()) {
          if (count > maxCount) { maxCount = count; maxPartnerId = partnerId; }
        }
        if (maxPartnerId) {
          partnersByPlayer.set(playerId, {
            id: maxPartnerId,
            nombre: partnerNames.get(maxPartnerId) || null,
            partidos: maxCount,
          });
        }
      }

      return { partnersByPlayer, error: null };
    }

    lastError = error;
    if (!isMissingColumnError(error)) break;
  }

  return { partnersByPlayer: new Map(), error: lastError };
};

const parseFilters = (query) => {
  const modalidad = query.modalidad || 'Singles';
  const sexo = query.sexo || 'Masculino';
  const categoriaRaw = query.categoria === undefined ? '3' : String(query.categoria);
  const categoria = Number.parseInt(categoriaRaw, 10);

  if (!MODALIDADES.has(modalidad)) {
    return { error: 'modalidad debe ser Singles o Dobles.' };
  }

  if (!SEXOS.has(sexo)) {
    return { error: 'sexo debe ser Masculino o Femenino.' };
  }

  if (!Number.isInteger(categoria) || categoria < 1 || categoria > 5) {
    return { error: 'categoria debe ser un numero entre 1 y 5.' };
  }

  return { modalidad, sexo, categoria };
};

const getRankings = async (req, res) => {
  try {
    const { clubId, error: clubError } = resolveClubIdFromRequest(req);
    if (clubError) {
      return res.status(400).json({ error: clubError });
    }

    const { modalidad, sexo, categoria, error: filtersError } = parseFilters(req.query || {});

    if (filtersError) {
      return res.status(400).json({ error: filtersError });
    }

    const categoriaField = modalidad === 'Singles' ? 'categoria_singles' : 'categoria_dobles';
    const { data, error } = await fetchRankingsCompat({ sexo, categoriaField, categoria, clubId });

    if (error) {
      console.error('Error al obtener rankings:', error);
      return res.status(500).json({ error: 'Error al obtener rankings', details: error.message });
    }

    const rows = Array.isArray(data) ? data : [];
    let adminIds = new Set();
    if (rows.length > 0) {
      const { adminIds: resolvedAdminIds, error: adminFilterError } = await fetchAdminProfileIdsCompat(clubId);
      if (adminFilterError) {
        console.warn('No se pudo resolver filtro de admins en ranking:', adminFilterError?.message || adminFilterError);
      }
      adminIds = resolvedAdminIds;
    }

    const sortedRows = rows
      .filter((jugador) => !adminIds.has(String(jugador?.id || '').trim()))
      .sort((a, b) => {
        const aPoints = resolvePointsByModalidad(a, modalidad);
        const bPoints = resolvePointsByModalidad(b, modalidad);
        if (bPoints !== aPoints) {
          return bPoints - aPoints;
        }

        const aName = String(a?.nombre_completo || '').trim().toLowerCase();
        const bName = String(b?.nombre_completo || '').trim().toLowerCase();
        if (aName !== bName) return aName.localeCompare(bName);

        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });

    const playerIds = sortedRows
      .map((jugador) => String(jugador?.id || '').trim())
      .filter(Boolean);

    const { ids: clubTournamentIds, error: clubTorneosError } = await fetchClubTournamentIds(clubId);
    if (clubTorneosError) {
      console.error('No se pudieron obtener torneos del club para ranking:', clubTorneosError);
      return res.status(500).json({ error: 'Error al obtener rankings', details: clubTorneosError.message });
    }

    const { winsByPlayer, error: tournamentWinsError } = await fetchTournamentWinsByPlayers(playerIds, clubTournamentIds);
    if (tournamentWinsError) {
      console.warn('No se pudo calcular torneos ganados, se usa fallback:', tournamentWinsError?.message || tournamentWinsError);
    }

    // For Dobles: find the most usual partner per player
    let partnersByPlayer = new Map();
    if (modalidad === 'Dobles' && playerIds.length > 0) {
      const { partnersByPlayer: resolved, error: partnerError } = await fetchUsualPartnersForDobles(playerIds, clubId);
      if (partnerError) {
        console.warn('No se pudo calcular compañeros habituales:', partnerError?.message || partnerError);
      } else {
        partnersByPlayer = resolved;
      }
    }

    const jugadores = sortedRows
      .map((jugador) => ({
        id: jugador.id,
        nombre_completo: jugador.nombre_completo,
        foto_url: jugador.foto_url,
        ranking_puntos: Number(jugador.ranking_puntos ?? 0),
        ranking_puntos_singles: Number(jugador.ranking_puntos_singles ?? jugador.ranking_puntos ?? 0),
        ranking_puntos_dobles: Number(jugador.ranking_puntos_dobles ?? jugador.ranking_puntos ?? 0),
        ranking_elo_singles: jugador.ranking_elo_singles,
        ranking_elo_dobles: jugador.ranking_elo_dobles,
        ranking_elo: jugador.ranking_elo,
        torneos: Number(winsByPlayer.get(String(jugador.id || '')) ?? 0),
        torneos_ganados: Number(winsByPlayer.get(String(jugador.id || '')) ?? 0),
        victorias: Number(jugador.victorias || 0),
        companero_habitual_id: partnersByPlayer.get(String(jugador.id || ''))?.id ?? null,
        companero_habitual_nombre: partnersByPlayer.get(String(jugador.id || ''))?.nombre ?? null,
      }));

    return res.json(jugadores);
  } catch (err) {
    console.error('Error inesperado en getRankings:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  getRankings,
};
