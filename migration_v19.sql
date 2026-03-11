-- Puntos por ronda alcanzada: distingue finalista y campeon.

ALTER TABLE public.torneos
  ADD COLUMN IF NOT EXISTS puntos_campeon integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneos_puntos_campeon_no_negativos_chk'
      AND conrelid = 'public.torneos'::regclass
  ) THEN
    ALTER TABLE public.torneos
      ADD CONSTRAINT torneos_puntos_campeon_no_negativos_chk
      CHECK (puntos_campeon >= 0);
  END IF;
END;
$$;

ALTER TABLE public.partidos
  ADD COLUMN IF NOT EXISTS ranking_puntos_perdedor_otorgados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ranking_puntos_perdedor_jugador_id uuid,
  ADD COLUMN IF NOT EXISTS ranking_puntos_perdedor_modalidad text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partidos_ranking_puntos_perdedor_no_negativo_chk'
      AND conrelid = 'public.partidos'::regclass
  ) THEN
    ALTER TABLE public.partidos
      ADD CONSTRAINT partidos_ranking_puntos_perdedor_no_negativo_chk
      CHECK (ranking_puntos_perdedor_otorgados >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partidos_ranking_puntos_perdedor_modalidad_chk'
      AND conrelid = 'public.partidos'::regclass
  ) THEN
    ALTER TABLE public.partidos
      ADD CONSTRAINT partidos_ranking_puntos_perdedor_modalidad_chk
      CHECK (
        ranking_puntos_perdedor_modalidad IS NULL
        OR ranking_puntos_perdedor_modalidad IN ('Singles', 'Dobles')
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partidos'
      AND column_name = 'ranking_puntos_perdedor_jugador_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'partidos_ranking_puntos_perdedor_jugador_fk'
        AND conrelid = 'public.partidos'::regclass
    ) THEN
      ALTER TABLE public.partidos
        ADD CONSTRAINT partidos_ranking_puntos_perdedor_jugador_fk
        FOREIGN KEY (ranking_puntos_perdedor_jugador_id)
        REFERENCES public.perfiles(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_partidos_ranking_points_loser_award
  ON public.partidos (torneo_id, ronda_orden, ranking_puntos_perdedor_jugador_id);
