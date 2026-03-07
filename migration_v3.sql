-- 1. Añadir pago_confirmado a la tabla de inscripciones
ALTER TABLE inscripciones ADD COLUMN pago_confirmado BOOLEAN NOT NULL DEFAULT false;

-- 2. Crear tabla de partidos (Bracket/Cuadro)
CREATE TABLE partidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
    ronda VARCHAR(50) NOT NULL,
    ronda_orden INTEGER NOT NULL,
    jugador1_id UUID REFERENCES perfiles(id) ON DELETE SET NULL,
    jugador2_id UUID REFERENCES perfiles(id) ON DELETE SET NULL,
    ganador_id UUID REFERENCES perfiles(id) ON DELETE SET NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE NULL, -- Permitir NULL
    cancha_id UUID REFERENCES canchas(id) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'programado', -- 'programado', 'en_juego', 'finalizado'
    notas TEXT -- Para añadir mensajes como "Conflicto de horarios"
);

-- (Opcional) Activar RLS
-- ALTER TABLE partidos ENABLE ROW LEVEL SECURITY;
