-- migration_v17.sql
-- Reparacion de coherencia de cuadro para torneos legacy.
--
-- Objetivos:
-- 1) Completar columnas de metadata de cuadro si faltan.
-- 2) Backfill deterministico de orden_en_ronda.
-- 3) Reenlazar partidos origen por ronda (j1/j2_origen_partido_id).
-- 4) Alinear jugadores de rondas siguientes con ganadores de origen.
-- 5) Sanear ganador_id/estado inconsistentes.

ALTER TABLE IF EXISTS public.partidos
  ADD COLUMN IF NOT EXISTS score text,
  ADD COLUMN IF NOT EXISTS resultado jsonb,
  ADD COLUMN IF NOT EXISTS orden_en_ronda integer,
  ADD COLUMN IF NOT EXISTS jugador1_origen_partido_id uuid,
  ADD COLUMN IF NOT EXISTS jugador2_origen_partido_id uuid,
  ADD COLUMN IF NOT EXISTS marcador_en_vivo jsonb,
  ADD COLUMN IF NOT EXISTS inicio_real timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_actualizacion timestamptz;

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

-- 1) Recalcular orden_en_ronda de forma deterministica por torneo+ronda.
WITH ordered AS (
  SELECT
    p.id,
    ROW_NUMBER() OVER (
      PARTITION BY p.torneo_id, p.ronda_orden
      ORDER BY
        COALESCE(p.fecha_hora, '9999-12-31'::timestamptz),
        COALESCE(p.cancha_id::text, ''),
        COALESCE(p.created_at, '1970-01-01'::timestamptz),
        p.id
    ) AS rn
  FROM public.partidos p
)
UPDATE public.partidos p
SET orden_en_ronda = ordered.rn
FROM ordered
WHERE p.id = ordered.id
  AND p.orden_en_ronda IS DISTINCT FROM ordered.rn;

-- 2) Reenlazar origenes para rondas siguientes.
-- IMPORTANTE: se omite la primera ronda de cada torneo (la de mayor ronda_orden),
-- porque no tiene ronda previa real para enlazar.
WITH ranked AS (
  SELECT
    p.id,
    p.torneo_id,
    p.ronda_orden,
    p.orden_en_ronda AS rn
  FROM public.partidos p
  WHERE p.orden_en_ronda IS NOT NULL
),
max_round AS (
  SELECT torneo_id, MAX(ronda_orden) AS max_ronda_orden
  FROM ranked
  GROUP BY torneo_id
),
mapping AS (
  SELECT
    cur.id AS current_id,
    src1.id AS source1_id,
    src2.id AS source2_id
  FROM ranked cur
  JOIN max_round mr
    ON mr.torneo_id = cur.torneo_id
  LEFT JOIN ranked src1
    ON src1.torneo_id = cur.torneo_id
   AND src1.ronda_orden = cur.ronda_orden * 2
   AND src1.rn = (cur.rn * 2) - 1
  LEFT JOIN ranked src2
    ON src2.torneo_id = cur.torneo_id
   AND src2.ronda_orden = cur.ronda_orden * 2
   AND src2.rn = (cur.rn * 2)
  WHERE cur.ronda_orden < mr.max_ronda_orden
)
UPDATE public.partidos cur
SET
  jugador1_origen_partido_id = mapping.source1_id,
  jugador2_origen_partido_id = mapping.source2_id
FROM mapping
WHERE cur.id = mapping.current_id
  AND (
    cur.jugador1_origen_partido_id IS DISTINCT FROM mapping.source1_id
    OR cur.jugador2_origen_partido_id IS DISTINCT FROM mapping.source2_id
  );

-- 3) Alinear jugadores de ronda siguiente segun ganador de sus partidos origen.
-- Tambien omite primera ronda de cada torneo.
WITH aligned AS (
  SELECT
    cur.id AS current_id,
    src1.ganador_id AS next_j1,
    src2.ganador_id AS next_j2
  FROM public.partidos cur
  JOIN (
    SELECT torneo_id, MAX(ronda_orden) AS max_ronda_orden
    FROM public.partidos
    GROUP BY torneo_id
  ) mr ON mr.torneo_id = cur.torneo_id
  LEFT JOIN public.partidos src1 ON src1.id = cur.jugador1_origen_partido_id
  LEFT JOIN public.partidos src2 ON src2.id = cur.jugador2_origen_partido_id
  WHERE cur.ronda_orden < mr.max_ronda_orden
)
UPDATE public.partidos cur
SET
  jugador1_id = aligned.next_j1,
  jugador2_id = aligned.next_j2
FROM aligned
WHERE cur.id = aligned.current_id
  AND (
    cur.jugador1_id IS DISTINCT FROM aligned.next_j1
    OR cur.jugador2_id IS DISTINCT FROM aligned.next_j2
  );

-- 4) Limpiar ganador_id invalido y estado finalizado inconsistente.
UPDATE public.partidos
SET
  ganador_id = NULL,
  estado = CASE
    WHEN LOWER(COALESCE(estado, '')) = 'finalizado' THEN 'programado'
    ELSE estado
  END
WHERE ganador_id IS NOT NULL
  AND ganador_id IS DISTINCT FROM jugador1_id
  AND ganador_id IS DISTINCT FROM jugador2_id;

-- 5) Si quedo finalizado sin ganador, devolver a programado.
UPDATE public.partidos
SET estado = 'programado'
WHERE LOWER(COALESCE(estado, '')) = 'finalizado'
  AND ganador_id IS NULL;
