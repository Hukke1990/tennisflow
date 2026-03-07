-- 3. Crear tabla de inscripciones
CREATE TABLE inscripciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
    jugador_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
    estado VARCHAR(20) NOT NULL DEFAULT 'confirmada', -- Puede ser 'confirmada', 'lista_espera', 'cancelada'
    fecha_inscripcion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Constraint para evitar doble inscripción del mismo jugador al mismo torneo
    UNIQUE(torneo_id, jugador_id)
);

-- (Opcional) Activar RLS
-- ALTER TABLE inscripciones ENABLE ROW LEVEL SECURITY;
