-- migration_v8.sql
-- Extiende la tabla perfiles con campos personales y técnicos del jugador

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS apellido         TEXT,
  ADD COLUMN IF NOT EXISTS localidad        TEXT,
  ADD COLUMN IF NOT EXISTS foto_url         TEXT,
  ADD COLUMN IF NOT EXISTS mano_dominante   TEXT DEFAULT 'Diestro',
  ADD COLUMN IF NOT EXISTS estilo_reves     TEXT DEFAULT '1 mano',
  ADD COLUMN IF NOT EXISTS altura           INTEGER,   -- en cm
  ADD COLUMN IF NOT EXISTS peso             INTEGER,   -- en kg
  ADD COLUMN IF NOT EXISTS categoria        INTEGER DEFAULT 3 CHECK (categoria BETWEEN 1 AND 5);
