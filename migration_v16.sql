-- migration_v16.sql
-- Completa metadatos de cuadro para resultados y trazabilidad de clasificados.

ALTER TABLE IF EXISTS public.partidos
  ADD COLUMN IF NOT EXISTS score text,
  ADD COLUMN IF NOT EXISTS resultado jsonb,
  ADD COLUMN IF NOT EXISTS orden_en_ronda integer,
  ADD COLUMN IF NOT EXISTS jugador1_origen_partido_id uuid,
  ADD COLUMN IF NOT EXISTS jugador2_origen_partido_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partidos_j1_origen_fk'
      AND conrelid = 'public.partidos'::regclass
  ) THEN
    ALTER TABLE public.partidos
      ADD CONSTRAINT partidos_j1_origen_fk
      FOREIGN KEY (jugador1_origen_partido_id)
      REFERENCES public.partidos(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partidos_j2_origen_fk'
      AND conrelid = 'public.partidos'::regclass
  ) THEN
    ALTER TABLE public.partidos
      ADD CONSTRAINT partidos_j2_origen_fk
      FOREIGN KEY (jugador2_origen_partido_id)
      REFERENCES public.partidos(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_partidos_torneo_ronda_orden
  ON public.partidos (torneo_id, ronda_orden, orden_en_ronda);

CREATE INDEX IF NOT EXISTS idx_partidos_origen_j1
  ON public.partidos (jugador1_origen_partido_id);

CREATE INDEX IF NOT EXISTS idx_partidos_origen_j2
  ON public.partidos (jugador2_origen_partido_id);

-- Backfill orden_en_ronda para cuadros ya creados.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY torneo_id, ronda_orden
      ORDER BY
        COALESCE(fecha_hora, '9999-12-31'::timestamptz),
        id
    ) AS rn
  FROM public.partidos
)
UPDATE public.partidos p
SET orden_en_ronda = ranked.rn
FROM ranked
WHERE ranked.id = p.id
  AND p.orden_en_ronda IS NULL;
