-- migration_v13.sql
-- Ranking multidimensional por modalidad/sexo/categoria con estadisticas agregadas.

-- 1) Indices de performance solicitados (solo si existen columnas destino)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'sexo'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'categoria_singles'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_elo_singles'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_perfiles_rank_singles ON public.perfiles (sexo, categoria_singles, ranking_elo_singles DESC)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'sexo'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'categoria_dobles'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_elo_dobles'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_perfiles_rank_dobles ON public.perfiles (sexo, categoria_dobles, ranking_elo_dobles DESC)';
  END IF;
END;
$$;

-- 2) Vista de rankings con estadisticas (evita N+1) y tolera columnas legacy ausentes
DO $$
DECLARE
  has_sexo boolean;
  has_categoria boolean;
  has_categoria_singles boolean;
  has_categoria_dobles boolean;
  has_ranking_elo boolean;
  has_ranking_elo_singles boolean;
  has_ranking_elo_dobles boolean;

  sexo_expr text;
  categoria_expr text;
  categoria_singles_expr text;
  categoria_dobles_expr text;
  ranking_elo_expr text;
  ranking_elo_singles_expr text;
  ranking_elo_dobles_expr text;
  ranking_elo_singles_resuelto_expr text;
  ranking_elo_dobles_resuelto_expr text;
  view_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'sexo'
  ) INTO has_sexo;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'categoria'
  ) INTO has_categoria;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'categoria_singles'
  ) INTO has_categoria_singles;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'categoria_dobles'
  ) INTO has_categoria_dobles;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_elo'
  ) INTO has_ranking_elo;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_elo_singles'
  ) INTO has_ranking_elo_singles;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_elo_dobles'
  ) INTO has_ranking_elo_dobles;

  sexo_expr := CASE WHEN has_sexo THEN 'pf.sexo' ELSE 'NULL::text' END;

  categoria_expr := CASE
    WHEN has_categoria THEN 'pf.categoria'
    WHEN has_categoria_singles THEN 'pf.categoria_singles'
    WHEN has_categoria_dobles THEN 'pf.categoria_dobles'
    ELSE 'NULL::integer'
  END;

  categoria_singles_expr := CASE
    WHEN has_categoria_singles AND has_categoria THEN 'COALESCE(pf.categoria_singles, pf.categoria)'
    WHEN has_categoria_singles THEN 'pf.categoria_singles'
    WHEN has_categoria THEN 'pf.categoria'
    ELSE 'NULL::integer'
  END;

  categoria_dobles_expr := CASE
    WHEN has_categoria_dobles AND has_categoria THEN 'COALESCE(pf.categoria_dobles, pf.categoria)'
    WHEN has_categoria_dobles THEN 'pf.categoria_dobles'
    WHEN has_categoria THEN 'pf.categoria'
    ELSE 'NULL::integer'
  END;

  ranking_elo_singles_expr := CASE
    WHEN has_ranking_elo_singles THEN 'pf.ranking_elo_singles'
    WHEN has_ranking_elo THEN 'pf.ranking_elo'
    WHEN has_ranking_elo_dobles THEN 'pf.ranking_elo_dobles'
    ELSE 'NULL::integer'
  END;

  ranking_elo_dobles_expr := CASE
    WHEN has_ranking_elo_dobles THEN 'pf.ranking_elo_dobles'
    WHEN has_ranking_elo THEN 'pf.ranking_elo'
    WHEN has_ranking_elo_singles THEN 'pf.ranking_elo_singles'
    ELSE 'NULL::integer'
  END;

  ranking_elo_expr := CASE
    WHEN has_ranking_elo THEN 'pf.ranking_elo'
    ELSE format('COALESCE(%s, %s, 0)', ranking_elo_singles_expr, ranking_elo_dobles_expr)
  END;

  ranking_elo_singles_resuelto_expr := format('COALESCE(%s, %s, 0)', ranking_elo_singles_expr, ranking_elo_expr);
  ranking_elo_dobles_resuelto_expr := format('COALESCE(%s, %s, 0)', ranking_elo_dobles_expr, ranking_elo_expr);

  view_sql := format($fmt$
    CREATE OR REPLACE VIEW public.vw_rankings_perfiles AS
    WITH stats AS (
      SELECT
        p.id AS jugador_id,
        COUNT(DISTINCT pa.torneo_id) FILTER (WHERE pa.estado = 'finalizado')::int AS torneos,
        COUNT(pa.id) FILTER (WHERE pa.estado = 'finalizado' AND pa.ganador_id = p.id)::int AS victorias
      FROM public.perfiles p
      LEFT JOIN public.partidos pa
        ON pa.jugador1_id = p.id OR pa.jugador2_id = p.id
      GROUP BY p.id
    )
    SELECT
      pf.id,
      pf.nombre_completo,
      pf.foto_url,
      %s AS sexo,
      %s AS categoria,
      %s AS categoria_singles,
      %s AS categoria_dobles,
      %s AS ranking_elo,
      %s AS ranking_elo_singles,
      %s AS ranking_elo_dobles,
      %s AS ranking_elo_singles_resuelto,
      %s AS ranking_elo_dobles_resuelto,
      COALESCE(stats.torneos, 0) AS torneos,
      COALESCE(stats.victorias, 0) AS victorias
    FROM public.perfiles pf
    LEFT JOIN stats ON stats.jugador_id = pf.id;
  $fmt$,
    sexo_expr,
    categoria_expr,
    categoria_singles_expr,
    categoria_dobles_expr,
    ranking_elo_expr,
    ranking_elo_singles_expr,
    ranking_elo_dobles_expr,
    ranking_elo_singles_resuelto_expr,
    ranking_elo_dobles_resuelto_expr
  );

  EXECUTE view_sql;
END;
$$;
