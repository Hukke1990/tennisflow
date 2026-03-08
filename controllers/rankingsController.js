const supabase = require('../services/supabase');

const MODALIDADES = new Set(['Singles', 'Dobles']);
const SEXOS = new Set(['Masculino', 'Femenino']);

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
    const rankingResolvedField = modalidad === 'Singles'
      ? 'ranking_elo_singles_resuelto'
      : 'ranking_elo_dobles_resuelto';

    const { data, error } = await supabase
      .from('vw_rankings_perfiles')
      .select(`
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
      `)
      .eq('sexo', sexo)
      .eq(categoriaField, categoria)
      .not('nombre_completo', 'is', null)
      .order(rankingResolvedField, { ascending: false })
      .order('ranking_elo', { ascending: false });

    if (error) {
      console.error('Error al obtener rankings:', error);
      return res.status(500).json({ error: 'Error al obtener rankings', details: error.message });
    }

    const jugadores = (data || [])
      .sort((a, b) => {
        const aElo = modalidad === 'Singles'
          ? (a.ranking_elo_singles ?? a.ranking_elo ?? Number.NEGATIVE_INFINITY)
          : (a.ranking_elo_dobles ?? a.ranking_elo ?? Number.NEGATIVE_INFINITY);
        const bElo = modalidad === 'Singles'
          ? (b.ranking_elo_singles ?? b.ranking_elo ?? Number.NEGATIVE_INFINITY)
          : (b.ranking_elo_dobles ?? b.ranking_elo ?? Number.NEGATIVE_INFINITY);

        if (bElo !== aElo) {
          return bElo - aElo;
        }

        return (b.ranking_elo || 0) - (a.ranking_elo || 0);
      })
      .map((jugador) => ({
        id: jugador.id,
        nombre_completo: jugador.nombre_completo,
        foto_url: jugador.foto_url,
        ranking_elo_singles: jugador.ranking_elo_singles,
        ranking_elo_dobles: jugador.ranking_elo_dobles,
        ranking_elo: jugador.ranking_elo,
        torneos: Number(jugador.torneos || 0),
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
