-- 1. Añadir el campo fecha_cierre_inscripcion a la tabla torneos
ALTER TABLE torneos ADD COLUMN fecha_cierre_inscripcion TIMESTAMP WITH TIME ZONE NULL;

-- 2. Insertar algunas canchas iniciales simulando datos 
INSERT INTO canchas (nombre, esta_disponible) VALUES 
('Cancha Principal (Polvo de Ladrillo)', true),
('Cancha 2 (Sintética)', true),
('Cancha 3 (Polvo de Ladrillo)', false),
('Cancha 4 (Rápida)', true);
