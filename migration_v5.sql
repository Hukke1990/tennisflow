-- migration_v5.sql
-- Para poder inyectar usuarios de prueba (UUIDs falsos o creados manual) sin el bloque de Supabase Auth
ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_id_fkey;
