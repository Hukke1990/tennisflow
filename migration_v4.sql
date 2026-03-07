-- migration_v4.sql
-- Remover la restricción NOT NULL de la fecha de cierre de inscripción en Torneos
ALTER TABLE torneos ALTER COLUMN fecha_cierre_inscripcion DROP NOT NULL;
