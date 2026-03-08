-- migration_v12.sql
-- Gestion de canchas + asignacion de canchas a torneos.

-- 1) Asegurar columnas de canchas
ALTER TABLE IF EXISTS public.canchas
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS tipo_superficie text,
  ADD COLUMN IF NOT EXISTS esta_disponible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS descripcion text;

-- 2) Tabla pivote torneo_canchas
CREATE TABLE IF NOT EXISTS public.torneo_canchas (
  torneo_id uuid NOT NULL REFERENCES public.torneos(id) ON DELETE CASCADE,
  cancha_id uuid NOT NULL REFERENCES public.canchas(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (torneo_id, cancha_id)
);

-- 3) Indices para consultas por torneo/cancha
CREATE INDEX IF NOT EXISTS idx_torneo_canchas_torneo
  ON public.torneo_canchas(torneo_id);

CREATE INDEX IF NOT EXISTS idx_torneo_canchas_cancha
  ON public.torneo_canchas(cancha_id);
