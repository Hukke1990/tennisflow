-- Script de inicialización de la base de datos para TennisFlow en Supabase

-- 1. Crear el tipo ENUM para los estados de los torneos
CREATE TYPE estado_torneo AS ENUM ('inscripcion', 'en_progreso', 'finalizado');

-- 2. Tabla de perfiles, enlazada a auth.users de Supabase
CREATE TABLE perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo VARCHAR(255) NOT NULL,
    ranking_elo INTEGER DEFAULT 1200,
    es_admin BOOLEAN DEFAULT false
);

-- 3. Tabla de disponibilidad de los jugadores
CREATE TABLE disponibilidad_jugador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jugador_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    -- Constraint solicitado: hora de inicio debe ser menor que la hora de fin
    CONSTRAINT check_horario_valido CHECK (hora_inicio < hora_fin)
);

-- 4. Tabla de torneos
CREATE TABLE torneos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(255) NOT NULL,
    cupos_max INTEGER NOT NULL CHECK (cupos_max > 0),
    costo NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    fecha_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    estado estado_torneo NOT NULL DEFAULT 'inscripcion'
);

-- 5. Tabla de canchas
CREATE TABLE canchas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    esta_disponible BOOLEAN DEFAULT true
);

-- (Opcional) Activar RLS (Row Level Security) - Ideal para Supabase
-- ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE disponibilidad_jugador ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE torneos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE canchas ENABLE ROW LEVEL SECURITY;
