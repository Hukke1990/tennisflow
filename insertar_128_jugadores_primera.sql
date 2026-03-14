-- SQL para crear 64 jugadores masculinos y 64 femeninos en categoría primera
-- Ejecutar en Supabase SQL Editor si se desea carga directa

INSERT INTO perfiles (id, nombre_completo, sexo, categoria, ranking_elo, es_admin)
SELECT
  gen_random_uuid(),
  'Jugador Masculino ' || i,
  'masculino',
  1,
  1200 + (random() * 400)::int,
  false
FROM generate_series(1,64) AS s(i);

INSERT INTO perfiles (id, nombre_completo, sexo, categoria, ranking_elo, es_admin)
SELECT
  gen_random_uuid(),
  'Jugadora Femenina ' || i,
  'femenino',
  1,
  1200 + (random() * 400)::int,
  false
FROM generate_series(1,64) AS s(i);
