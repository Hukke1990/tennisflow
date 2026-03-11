-- migration_v14.sql
-- Requisitos competitivos por torneo y validaciones de dominio.

ALTER TABLE IF EXISTS public.torneos
  ADD COLUMN IF NOT EXISTS rama text,
  ADD COLUMN IF NOT EXISTS modalidad text,
  ADD COLUMN IF NOT EXISTS categoria_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneos_modalidad_valida_chk'
      AND conrelid = 'public.torneos'::regclass
  ) THEN
    ALTER TABLE public.torneos
      ADD CONSTRAINT torneos_modalidad_valida_chk
      CHECK (
        modalidad IS NULL
        OR lower(modalidad) IN ('single', 'singles', 'double', 'dobles', 'doubles')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneos_rama_valida_chk'
      AND conrelid = 'public.torneos'::regclass
  ) THEN
    ALTER TABLE public.torneos
      ADD CONSTRAINT torneos_rama_valida_chk
      CHECK (
        rama IS NULL
        OR lower(rama) IN ('masculino', 'femenino', 'mixto', 'male', 'female', 'mixed', 'm', 'f', 'x')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'torneos_categoria_id_valida_chk'
      AND conrelid = 'public.torneos'::regclass
  ) THEN
    ALTER TABLE public.torneos
      ADD CONSTRAINT torneos_categoria_id_valida_chk
      CHECK (categoria_id IS NULL OR (categoria_id BETWEEN 1 AND 5));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_torneos_modalidad_rama_categoria
  ON public.torneos (modalidad, rama, categoria_id);
