const supabase = require('../services/supabase');

const MODALIDADES = new Set(['Singles', 'Dobles']);
const SEXOS = new Set(['Masculino', 'Femenino']);

const isMissingColumnError = (error) => {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
};

const resolvePointsByModalidad = (jugador = {}, modalidad = 'Singles') => {
  const value = modalidad === 'Dobles'
    ? Number(jugador.ranking_puntos_dobles ?? jugador.ranking_puntos ?? 0)
    : Number(jugador.ranking_puntos_singles ?? jugador.ranking_puntos ?? 0);

  return Number.isFinite(value) ? value : 0;
};

const fetchTournamentWinsByPlayers = async (playerIds = []) => {
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
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

const fetchRankingsCompat = async ({ sexo, categoriaField, categoria }) => {
  const selectOptions = [
    `
      id,
      nombre_completo,
      foto_url,
      sexo,
      categoria,
      categoria_singles,
      categoria_dobles,
      ranking_elo,
      ranking_elo_singles,
      ranking_elo_dobles,
      ranking_elo_singles_resuelto,
      ranking_elo_dobles_resuelto,
      ranking_puntos,
      ranking_puntos_singles,
      ranking_puntos_dobles,
      ranking_puntos_singles_resuelto,
      ranking_puntos_dobles_resuelto,
      torneos,
      victorias
    `,
    `
      id,
      nombre_completo,
      foto_url,
      sexo,
      categoria,
      categoria_singles,
      categoria_dobles,
      ranking_elo,
      ranking_elo_singles,
      ranking_elo_dobles,
      ranking_elo_singles_resuelto,
      ranking_elo_dobles_resuelto,
      torneos,
      victorias
    `,
  ];

  let lastError = null;
  for (const columns of selectOptions) {
    const { data, error } = await supabase
      .from('vw_rankings_perfiles')
      .select(columns)
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
    const { modalidad, sexo, categoria, error: filtersError } = parseFilters(req.query || {});

    if (filtersError) {
      return res.status(400).json({ error: filtersError });
    }

    const categoriaField = modalidad === 'Singles' ? 'categoria_singles' : 'categoria_dobles';
    const { data, error } = await fetchRankingsCompat({ sexo, categoriaField, categoria });

    if (error) {
      console.error('Error al obtener rankings:', error);
      return res.status(500).json({ error: 'Error al obtener rankings', details: error.message });
    }

    const sortedRows = (data || [])
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

    const { winsByPlayer, error: tournamentWinsError } = await fetchTournamentWinsByPlayers(playerIds);
    if (tournamentWinsError) {
      console.warn('No se pudo calcular torneos ganados, se usa fallback:', tournamentWinsError?.message || tournamentWinsError);
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
