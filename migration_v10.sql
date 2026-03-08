-- migration_v10.sql
-- Soporte para nueva ventana de inscripcion y disponibilidad por torneo/jugador.

-- 1) Asegurar columnas de fechas en torneos
ALTER TABLE torneos
  ADD COLUMN IF NOT EXISTS fecha_inicio_inscripcion TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS fecha_cierre_inscripcion TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS fecha_fin TIMESTAMP WITH TIME ZONE NULL;

-- 2) Crear tabla de disponibilidad especifica de inscripcion (no perfil general)
CREATE TABLE IF NOT EXISTS disponibilidad_inscripcion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  jugador_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  dia_semana SMALLINT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  es_obligatoria_fin_semana BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT disponibilidad_inscripcion_hora_valida CHECK (hora_inicio < hora_fin),
  CONSTRAINT disponibilidad_inscripcion_dia_semana_valido CHECK (dia_semana BETWEEN 0 AND 6)
);

-- 3) Indices requeridos para filtros por torneo/jugador y torneo/fecha
CREATE INDEX IF NOT EXISTS idx_disponibilidad_inscripcion_torneo_jugador
  ON disponibilidad_inscripcion (torneo_id, jugador_id);

CREATE INDEX IF NOT EXISTS idx_disponibilidad_inscripcion_torneo_fecha
  ON disponibilidad_inscripcion (torneo_id, fecha);

-- 4) Trigger para mantener updated_at al dia
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_disponibilidad_inscripcion_updated_at'
  ) THEN
    CREATE TRIGGER trg_disponibilidad_inscripcion_updated_at
    BEFORE UPDATE ON disponibilidad_inscripcion
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
