-- migration_v9.sql
-- Convierte las columnas de tipo ENUM a TEXT libre para aceptar cualquier valor de string.
-- Los valores actuales son todos NULL, por lo que no hay pérdida de datos.

ALTER TABLE perfiles 
  ALTER COLUMN estilo_reves TYPE TEXT USING estilo_reves::TEXT,
  ALTER COLUMN mano_dominante TYPE TEXT USING mano_dominante::TEXT;
