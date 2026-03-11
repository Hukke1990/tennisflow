-- migration_v15.sql
-- Campos para resultados en vivo y trazabilidad temporal de partidos.

ALTER TABLE IF EXISTS public.partidos
  ADD COLUMN IF NOT EXISTS marcador_en_vivo jsonb,
  ADD COLUMN IF NOT EXISTS ultima_actualizacion timestamptz,
  ADD COLUMN IF NOT EXISTS inicio_real timestamptz;

CREATE INDEX IF NOT EXISTS idx_partidos_torneo_cancha_estado_fecha
  ON public.partidos (torneo_id, cancha_id, estado, fecha_hora);
