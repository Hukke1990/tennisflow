-- migration_v6.sql
-- Añade las columnas faltantes en inscripciones (estado y pago_confirmado)
ALTER TABLE inscripciones 
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'confirmada',
  ADD COLUMN IF NOT EXISTS pago_confirmado BOOLEAN NOT NULL DEFAULT false;
