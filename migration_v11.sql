-- migration_v11.sql
-- Endurece estados de inscripcion y promueve borradores validos de forma segura.

-- 1) Compatibilidad de estados si torneos.estado usa ENUM estado_torneo
ALTER TYPE IF EXISTS estado_torneo ADD VALUE IF NOT EXISTS 'publicado';
ALTER TYPE IF EXISTS estado_torneo ADD VALUE IF NOT EXISTS 'abierto';

-- 1.1) Default seguro: nuevos torneos quedan publicados
ALTER TABLE torneos
  ALTER COLUMN estado SET DEFAULT 'publicado';

-- 2) Promocion controlada de borradores validos
WITH updated AS (
  UPDATE torneos
  SET estado = 'publicado'
  WHERE estado::text = 'borrador'
    AND fecha_inicio_inscripcion IS NOT NULL
    AND fecha_cierre_inscripcion IS NOT NULL
    AND fecha_inicio IS NOT NULL
    AND fecha_inicio_inscripcion <= fecha_cierre_inscripcion
    AND fecha_cierre_inscripcion <= fecha_inicio
  RETURNING id
)
SELECT COUNT(*) AS borradores_promovidos_a_publicado
FROM updated;

-- 3) Reporte de borradores restantes (requieren correccion manual)
SELECT COUNT(*) AS borradores_invalidos_sin_promover
FROM torneos
WHERE estado::text = 'borrador';

-- 4) Ajustes idempotentes en canchas
ALTER TABLE IF EXISTS public.canchas
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS tipo_superficie text,
  ADD COLUMN IF NOT EXISTS esta_disponible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS descripcion text;

-- Opcional: habilitar si quieres forzar nombre no nulo
-- ALTER TABLE public.canchas ALTER COLUMN nombre SET NOT NULL;
