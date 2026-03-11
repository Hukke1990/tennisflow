-- migration_v18.sql
-- Puntos por ronda configurables por torneo + ranking por puntos por modalidad.

ALTER TABLE IF EXISTS public.torneos
  ADD COLUMN IF NOT EXISTS puntos_ronda_32 integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS puntos_ronda_16 integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS puntos_ronda_8 integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS puntos_ronda_4 integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS puntos_ronda_2 integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneos_puntos_ronda_no_negativos_chk'
      AND conrelid = 'public.torneos'::regclass
  ) THEN
    ALTER TABLE public.torneos
      ADD CONSTRAINT torneos_puntos_ronda_no_negativos_chk
      CHECK (
        puntos_ronda_32 >= 0
        AND puntos_ronda_16 >= 0
        AND puntos_ronda_8 >= 0
        AND puntos_ronda_4 >= 0
        AND puntos_ronda_2 >= 0
      );
  END IF;
END;
$$;

ALTER TABLE IF EXISTS public.perfiles
  ADD COLUMN IF NOT EXISTS ranking_puntos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ranking_puntos_singles integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ranking_puntos_dobles integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'perfiles_ranking_puntos_no_negativos_chk'
      AND conrelid = 'public.perfiles'::regclass
  ) THEN
    ALTER TABLE public.perfiles
      ADD CONSTRAINT perfiles_ranking_puntos_no_negativos_chk
      CHECK (
        ranking_puntos >= 0
        AND ranking_puntos_singles >= 0
        AND ranking_puntos_dobles >= 0
      );
  END IF;
END;
$$;

ALTER TABLE IF EXISTS public.partidos
  ADD COLUMN IF NOT EXISTS ranking_puntos_otorgados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ranking_puntos_jugador_id uuid,
  ADD COLUMN IF NOT EXISTS ranking_puntos_modalidad text;

DO $$
BEGIN
  IF to_regclass('public.partidos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'partidos_ranking_puntos_no_negativos_chk'
        AND conrelid = 'public.partidos'::regclass
    ) THEN
      ALTER TABLE public.partidos
        ADD CONSTRAINT partidos_ranking_puntos_no_negativos_chk
        CHECK (ranking_puntos_otorgados >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'partidos_ranking_puntos_modalidad_chk'
        AND conrelid = 'public.partidos'::regclass
    ) THEN
      ALTER TABLE public.partidos
        ADD CONSTRAINT partidos_ranking_puntos_modalidad_chk
        CHECK (
          ranking_puntos_modalidad IS NULL
          OR ranking_puntos_modalidad IN ('Singles', 'Dobles')
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'partidos_ranking_puntos_jugador_fk'
        AND conrelid = 'public.partidos'::regclass
    ) THEN
      ALTER TABLE public.partidos
        ADD CONSTRAINT partidos_ranking_puntos_jugador_fk
        FOREIGN KEY (ranking_puntos_jugador_id)
        REFERENCES public.perfiles(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_perfiles_rank_points_singles
  ON public.perfiles (sexo, categoria_singles, ranking_puntos_singles DESC, ranking_elo_singles DESC);

CREATE INDEX IF NOT EXISTS idx_perfiles_rank_points_dobles
  ON public.perfiles (sexo, categoria_dobles, ranking_puntos_dobles DESC, ranking_elo_dobles DESC);

CREATE INDEX IF NOT EXISTS idx_partidos_ranking_points_award
  ON public.partidos (torneo_id, ronda_orden, ranking_puntos_jugador_id);

-- Regenerar vista de rankings con columnas de puntos resueltas.
DO $$
DECLARE
  has_sexo boolean;
  has_categoria boolean;
  has_categoria_singles boolean;
  has_categoria_dobles boolean;
  has_ranking_elo boolean;
  has_ranking_elo_singles boolean;
  has_ranking_elo_dobles boolean;
  has_ranking_puntos boolean;
  has_ranking_puntos_singles boolean;
  has_ranking_puntos_dobles boolean;

  sexo_expr text;
  categoria_expr text;
  categoria_singles_expr text;
  categoria_dobles_expr text;
  ranking_elo_expr text;
  ranking_elo_singles_expr text;
  ranking_elo_dobles_expr text;
  ranking_elo_singles_resuelto_expr text;
  ranking_elo_dobles_resuelto_expr text;
  ranking_puntos_expr text;
  ranking_puntos_singles_expr text;
  ranking_puntos_dobles_expr text;
  ranking_puntos_singles_resuelto_expr text;
  ranking_puntos_dobles_resuelto_expr text;
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

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_puntos'
  ) INTO has_ranking_puntos;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_puntos_singles'
  ) INTO has_ranking_puntos_singles;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'ranking_puntos_dobles'
  ) INTO has_ranking_puntos_dobles;

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
    ELSE '0::integer'
  END;

  ranking_elo_dobles_expr := CASE
    WHEN has_ranking_elo_dobles THEN 'pf.ranking_elo_dobles'
    WHEN has_ranking_elo THEN 'pf.ranking_elo'
    WHEN has_ranking_elo_singles THEN 'pf.ranking_elo_singles'
    ELSE '0::integer'
  END;

  ranking_elo_expr := CASE
    WHEN has_ranking_elo THEN 'pf.ranking_elo'
    ELSE format('COALESCE(%s, %s, 0)', ranking_elo_singles_expr, ranking_elo_dobles_expr)
  END;

  ranking_elo_singles_resuelto_expr := format('COALESCE(%s, %s, 0)', ranking_elo_singles_expr, ranking_elo_expr);
  ranking_elo_dobles_resuelto_expr := format('COALESCE(%s, %s, 0)', ranking_elo_dobles_expr, ranking_elo_expr);

  ranking_puntos_singles_expr := CASE
    WHEN has_ranking_puntos_singles THEN 'pf.ranking_puntos_singles'
    WHEN has_ranking_puntos THEN 'pf.ranking_puntos'
    WHEN has_ranking_puntos_dobles THEN 'pf.ranking_puntos_dobles'
    ELSE '0::integer'
  END;

  ranking_puntos_dobles_expr := CASE
    WHEN has_ranking_puntos_dobles THEN 'pf.ranking_puntos_dobles'
    WHEN has_ranking_puntos THEN 'pf.ranking_puntos'
    WHEN has_ranking_puntos_singles THEN 'pf.ranking_puntos_singles'
    ELSE '0::integer'
  END;

  ranking_puntos_expr := CASE
    WHEN has_ranking_puntos THEN 'pf.ranking_puntos'
    ELSE format('COALESCE(%s, %s, 0)', ranking_puntos_singles_expr, ranking_puntos_dobles_expr)
  END;

  ranking_puntos_singles_resuelto_expr := format('COALESCE(%s, %s, 0)', ranking_puntos_singles_expr, ranking_puntos_expr);
  ranking_puntos_dobles_resuelto_expr := format('COALESCE(%s, %s, 0)', ranking_puntos_dobles_expr, ranking_puntos_expr);

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
      COALESCE(stats.victorias, 0) AS victorias,
      %s AS ranking_puntos,
      %s AS ranking_puntos_singles,
      %s AS ranking_puntos_dobles,
      %s AS ranking_puntos_singles_resuelto,
      %s AS ranking_puntos_dobles_resuelto
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
    ranking_elo_dobles_resuelto_expr,
    ranking_puntos_expr,
    ranking_puntos_singles_expr,
    ranking_puntos_dobles_expr,
    ranking_puntos_singles_resuelto_expr,
    ranking_puntos_dobles_resuelto_expr
  );

  EXECUTE view_sql;
END;
$$;
