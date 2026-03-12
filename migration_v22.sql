-- migration_v22.sql
-- Flujo de inscripciones por aprobacion administrativa.

ALTER TABLE inscripciones
  ADD COLUMN IF NOT EXISTS estado_inscripcion VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS fecha_validacion TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT NULL;

UPDATE inscripciones
SET estado_inscripcion = CASE
  WHEN COALESCE(LOWER(TRIM(estado)), '') = 'confirmada' THEN 'aprobada'
  WHEN COALESCE(LOWER(TRIM(estado)), '') IN ('cancelada', 'rechazada') THEN 'rechazada'
  ELSE 'pendiente'
END
WHERE estado_inscripcion IS NULL
  OR TRIM(estado_inscripcion) = '';

CREATE INDEX IF NOT EXISTS idx_inscripciones_torneo_estado_inscripcion
  ON inscripciones (torneo_id, estado_inscripcion);
