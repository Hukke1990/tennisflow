-- =============================================================================
-- Asigna ranking_elo_singles y ranking_elo_dobles únicos a todos los perfiles
-- del club b5e0923c, proporcionales a sus ranking_puntos_singles/dobles.
-- Esto permite que el bracket muestre posiciones de ranking correctas.
-- =============================================================================

UPDATE perfiles
SET
  ranking_elo_singles = 1200 + ranking_puntos_singles,
  ranking_elo_dobles  = 1200 + COALESCE(ranking_puntos_dobles, 0)
WHERE
  club_id = 'b5e0923c-166c-431d-a982-ffc8af604156'
  AND es_admin = false;

-- Verificación: mostrar top 10 por ELO Singles
SELECT
  id,
  nombre_completo,
  sexo,
  ranking_puntos_singles,
  ranking_elo_singles,
  ranking_elo_dobles
FROM perfiles
WHERE
  club_id = 'b5e0923c-166c-431d-a982-ffc8af604156'
  AND es_admin = false
ORDER BY ranking_elo_singles DESC
LIMIT 10;
