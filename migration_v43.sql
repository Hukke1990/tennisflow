-- migration_v43.sql
-- Índices para reducir latencia en queries frecuentes del sistema.
-- Los índices son IF NOT EXISTS → idempotentes, seguros de re-ejecutar.

-- Partidos por torneo (join/filter más común en cuadro y estado de canchas)
CREATE INDEX IF NOT EXISTS idx_partidos_torneo_id
  ON partidos(torneo_id);

-- Inscripciones por torneo (resumen de inscriptos en lista de torneos)
CREATE INDEX IF NOT EXISTS idx_inscripciones_torneo_id
  ON inscripciones(torneo_id);

-- Perfiles por club (rankings, dashboard, conteo de jugadores)
CREATE INDEX IF NOT EXISTS idx_perfiles_club_id
  ON perfiles(club_id);

-- Torneos por club (lista de torneos, dashboard)
CREATE INDEX IF NOT EXISTS idx_torneos_club_id
  ON torneos(club_id);

-- Inscripciones por club_id + estado (admin panel de inscripciones pendientes)
CREATE INDEX IF NOT EXISTS idx_inscripciones_club_estado
  ON inscripciones(club_id, estado_inscripcion);

-- Partidos por estado (filtros de estado en canchas y cuadro)
CREATE INDEX IF NOT EXISTS idx_partidos_torneo_estado
  ON partidos(torneo_id, estado);
