-- migration_v39.sql
-- Agrega is_active a clubes para el flujo de alta con pago diferido.
--
-- INSTRUCCIONES: ejecutar en Supabase Dashboard → SQL Editor.

-- 1. Nueva columna: is_active (default false = pendiente de pago)
ALTER TABLE clubes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- 2. Los clubes existentes ya están activos → los activamos
UPDATE clubes
   SET is_active = true
 WHERE is_active = false;

-- 3. Índice útil para el panel de SuperAdmin
CREATE INDEX IF NOT EXISTS idx_clubes_is_active ON clubes (is_active);
