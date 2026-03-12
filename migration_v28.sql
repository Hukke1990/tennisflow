-- migration_v28.sql
-- Soporte de dobles por pareja en inscripciones y cuadro de partidos.

ALTER TABLE IF EXISTS public.inscripciones
  ADD COLUMN IF NOT EXISTS pareja_id uuid,
  ADD COLUMN IF NOT EXISTS pareja_jugador_id uuid;

DO $$
BEGIN
  IF to_regclass('public.inscripciones') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'inscripciones_pareja_jugador_fk'
         AND conrelid = 'public.inscripciones'::regclass
     ) THEN
    ALTER TABLE public.inscripciones
      ADD CONSTRAINT inscripciones_pareja_jugador_fk
      FOREIGN KEY (pareja_jugador_id)
      REFERENCES public.perfiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.inscripciones') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'inscripciones_pareja_consistencia_chk'
         AND conrelid = 'public.inscripciones'::regclass
     ) THEN
    ALTER TABLE public.inscripciones
      ADD CONSTRAINT inscripciones_pareja_consistencia_chk
      CHECK (
        (
          pareja_id IS NULL
          AND pareja_jugador_id IS NULL
        )
        OR (
          pareja_id IS NOT NULL
          AND pareja_jugador_id IS NOT NULL
          AND pareja_jugador_id <> jugador_id
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inscripciones_torneo_pareja_id
  ON public.inscripciones (torneo_id, pareja_id);

CREATE INDEX IF NOT EXISTS idx_inscripciones_pareja_jugador_id
  ON public.inscripciones (pareja_jugador_id);

ALTER TABLE IF EXISTS public.partidos
  ADD COLUMN IF NOT EXISTS jugador1_pareja_id uuid,
  ADD COLUMN IF NOT EXISTS jugador2_pareja_id uuid,
  ADD COLUMN IF NOT EXISTS ganador_pareja_id uuid;

DO $$
BEGIN
  IF to_regclass('public.partidos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'partidos_jugador1_pareja_fk'
         AND conrelid = 'public.partidos'::regclass
     ) THEN
    ALTER TABLE public.partidos
      ADD CONSTRAINT partidos_jugador1_pareja_fk
      FOREIGN KEY (jugador1_pareja_id)
      REFERENCES public.perfiles(id)
      ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.partidos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'partidos_jugador2_pareja_fk'
         AND conrelid = 'public.partidos'::regclass
     ) THEN
    ALTER TABLE public.partidos
      ADD CONSTRAINT partidos_jugador2_pareja_fk
      FOREIGN KEY (jugador2_pareja_id)
      REFERENCES public.perfiles(id)
      ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.partidos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'partidos_ganador_pareja_fk'
         AND conrelid = 'public.partidos'::regclass
     ) THEN
    ALTER TABLE public.partidos
      ADD CONSTRAINT partidos_ganador_pareja_fk
      FOREIGN KEY (ganador_pareja_id)
      REFERENCES public.perfiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_partidos_torneo_ronda_parejas
  ON public.partidos (torneo_id, ronda_orden, jugador1_pareja_id, jugador2_pareja_id);
