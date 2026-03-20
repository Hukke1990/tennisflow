-- Script de inicialización de la base de datos para TennisFlow en Supabase

-- 1. Crear el tipo ENUM para los estados de los torneos
CREATE TYPE estado_torneo AS ENUM ('borrador', 'publicado', 'abierto', 'en_progreso', 'finalizado', 'cancelado');

-- 2. Tabla de perfiles, enlazada a auth.users de Supabase
CREATE TABLE perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo VARCHAR(255) NOT NULL,
    telefono TEXT,
    ranking_elo INTEGER DEFAULT 0,
    ranking_puntos INTEGER DEFAULT 0,
    ranking_puntos_singles INTEGER DEFAULT 0,
    ranking_puntos_dobles INTEGER DEFAULT 0,
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
    rama TEXT,
    modalidad TEXT,
    categoria_id INTEGER,
    puntos_ronda_32 INTEGER NOT NULL DEFAULT 5,
    puntos_ronda_16 INTEGER NOT NULL DEFAULT 10,
    puntos_ronda_8 INTEGER NOT NULL DEFAULT 25,
    puntos_ronda_4 INTEGER NOT NULL DEFAULT 50,
    puntos_ronda_2 INTEGER NOT NULL DEFAULT 100,
    fecha_inicio_inscripcion TIMESTAMP WITH TIME ZONE,
    fecha_cierre_inscripcion TIMESTAMP WITH TIME ZONE,
    fecha_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    fecha_fin TIMESTAMP WITH TIME ZONE,
    estado estado_torneo NOT NULL DEFAULT 'publicado'
);

-- 5. Disponibilidad enviada especificamente al inscribirse a un torneo
CREATE TABLE disponibilidad_inscripcion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
    jugador_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    es_obligatoria_fin_semana BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT disponibilidad_inscripcion_hora_valida CHECK (hora_inicio < hora_fin)
);

CREATE INDEX idx_disponibilidad_inscripcion_torneo_jugador
    ON disponibilidad_inscripcion (torneo_id, jugador_id);

CREATE INDEX idx_disponibilidad_inscripcion_torneo_fecha
    ON disponibilidad_inscripcion (torneo_id, fecha);

-- 6. Tabla de canchas
CREATE TABLE canchas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    tipo_superficie TEXT,
    esta_disponible BOOLEAN NOT NULL DEFAULT true,
    descripcion TEXT
);

-- 7. Relacion muchos a muchos entre torneos y canchas
CREATE TABLE torneo_canchas (
    torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
    cancha_id UUID NOT NULL REFERENCES canchas(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (torneo_id, cancha_id)
);

CREATE INDEX idx_torneo_canchas_torneo
    ON torneo_canchas (torneo_id);

CREATE INDEX idx_torneo_canchas_cancha
    ON torneo_canchas (cancha_id);

-- 8. Tabla de configuraciones globales de administracion
CREATE TABLE configuracion_admin (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- (Opcional) Activar RLS (Row Level Security) - Ideal para Supabase
-- ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE disponibilidad_jugador ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE torneos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE canchas ENABLE ROW LEVEL SECURITY;
