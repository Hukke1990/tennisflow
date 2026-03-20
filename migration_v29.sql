-- migration_v29.sql
-- Cambia el valor por defecto de las columnas de ranking a 0.
-- Los nuevos jugadores comienzan sin puntos y sin ELO base.
-- Nota: en producción no existe ranking_elo; solo ranking_elo_singles y ranking_elo_dobles.

-- 1) Cambiar DEFAULT de las columnas de ranking en perfiles
ALTER TABLE public.perfiles
  ALTER COLUMN ranking_elo_singles SET DEFAULT 0,
  ALTER COLUMN ranking_elo_dobles  SET DEFAULT 0;

-- ranking_puntos, ranking_puntos_singles y ranking_puntos_dobles
-- ya tienen DEFAULT 0 (migration_v18), no se tocan.

-- 2) Resetear a 0 los jugadores que NUNCA han jugado un partido.
--    Condición: no aparecen ni como jugador1, ni como jugador2 en ningún partido.
UPDATE public.perfiles p
SET
  ranking_elo_singles      = 0,
  ranking_elo_dobles       = 0,
  ranking_puntos           = 0,
  ranking_puntos_singles   = 0,
  ranking_puntos_dobles    = 0
WHERE
  NOT EXISTS (
    SELECT 1 FROM public.partidos pa WHERE pa.jugador1_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.partidos pa WHERE pa.jugador2_id = p.id
  );
