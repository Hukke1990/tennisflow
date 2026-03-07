const supabase = require('../services/supabase');

/**
 * GET /api/dashboard?jugador_id=UUID
 *
 * Devuelve de una sola llamada:
 *  - proximos_torneos:  Los torneos en estado 'inscripcion' más próximos (hasta 3)
 *  - torneos_finalizados: Últimos 3 torneos finalizados (para mostrar resultados)
 *  - ranking_top5:     Top 5 del ranking ELO de la categoría del jugador logueado
 *  - estadisticas_jugador: Victorias, derrotas y H2H del jugador (si se brinda jugador_id)
 */
const getDashboard = async (req, res) => {
  try {
    const { jugador_id } = req.query;

    // ── 0. Estadísticas Globales del Club ───────────────────────────────────
    const [
      { count: total_jugadores },
      { count: total_torneos_finalizados },
      { count: total_partidos_jugados },
    ] = await Promise.all([
      supabase.from('perfiles').select('*', { count: 'exact', head: true }),
      supabase.from('torneos').select('*', { count: 'exact', head: true }).eq('estado', 'finalizado'),
      supabase.from('partidos').select('*', { count: 'exact', head: true }).eq('estado', 'finalizado'),
    ]);

    const estadisticas_globales = {
      total_jugadores: total_jugadores || 0,
      torneos_realizados: total_torneos_finalizados || 0,
      partidos_jugados: total_partidos_jugados || 0,
    };

    // ── 1. Próximos torneos abiertos + contador de inscritos ────────────────
    const { data: torneos_raw, error: e1 } = await supabase
      .from('torneos')
      .select('id, titulo, fecha_inicio, cupos_max, costo, estado')
      .in('estado', ['inscripcion', 'borrador'])
      .order('fecha_inicio', { ascending: true })
      .limit(3);

    if (e1) throw e1;

    // Para cada torneo próximo, contar inscritos
    const proximos_torneos = await Promise.all((torneos_raw || []).map(async (t) => {
      const { count } = await supabase
        .from('inscripciones')
        .select('*', { count: 'exact', head: true })
        .eq('torneo_id', t.id);
      return { ...t, inscritos_count: count || 0 };
    }));

    // ── 2. Últimos 3 torneos finalizados ────────────────────────────────────
    const { data: torneos_finalizados, error: e2 } = await supabase
      .from('torneos')
      .select('id, titulo, fecha_inicio, estado')
      .eq('estado', 'finalizado')
      .order('fecha_inicio', { ascending: false })
      .limit(3);

    if (e2) throw e2;

    // ── 3. Ranking Top 5 global por ELO ─────────────────────────────────────
    let ranking_top5 = [];
    let categoria_jugador = null;

    if (jugador_id) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('categoria, ranking_elo')
        .eq('id', jugador_id)
        .single();
      categoria_jugador = perfil?.categoria ?? null;
    }

    const { data: rankingData, error: e3 } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, ranking_elo, categoria, foto_url')
      .order('ranking_elo', { ascending: false })
      .limit(5);

    if (e3) throw e3;

    ranking_top5 = (rankingData || []).map((j, idx) => ({
      posicion: idx + 1,
      id: j.id,
      nombre_completo: j.nombre_completo,
      ranking_elo: j.ranking_elo,
      categoria: j.categoria,
      foto_url: j.foto_url,
      es_yo: j.id === jugador_id,
    }));

    // ── 4. Estadísticas del jugador (victorias / derrotas / H2H) ───────────
    let estadisticas_jugador = null;

    if (jugador_id) {
      const { data: partidos } = await supabase
        .from('partidos')
        .select('jugador1_id, jugador2_id, ganador_id')
        .eq('estado', 'finalizado')
        .or(`jugador1_id.eq.${jugador_id},jugador2_id.eq.${jugador_id}`);

      let victorias = 0;
      let derrotas = 0;
      const h2h = {};

      for (const p of (partidos || [])) {
        if (!p.ganador_id) continue;
        const rival_id = p.jugador1_id === jugador_id ? p.jugador2_id : p.jugador1_id;
        const gano = p.ganador_id === jugador_id;
        if (gano) victorias++; else derrotas++;
        if (rival_id) {
          if (!h2h[rival_id]) h2h[rival_id] = { victorias: 0, derrotas: 0 };
          if (gano) h2h[rival_id].victorias++; else h2h[rival_id].derrotas++;
        }
      }

      estadisticas_jugador = {
        jugador_id, victorias, derrotas,
        total_partidos: victorias + derrotas,
        win_rate: victorias + derrotas > 0 ? Math.round((victorias / (victorias + derrotas)) * 100) : 0,
        h2h,
      };
    }

    // ── Respuesta final ─────────────────────────────────────────────────────
    return res.json({
      estadisticas_globales,
      proximos_torneos,
      torneos_finalizados: torneos_finalizados || [],
      ranking_top5,
      categoria_ranking: categoria_jugador,
      estadisticas_jugador,
    });

  } catch (err) {
    console.error('Error en getDashboard:', err);
    res.status(500).json({ error: 'Error al obtener datos del dashboard', details: err.message });
  }
};

module.exports = { getDashboard };
