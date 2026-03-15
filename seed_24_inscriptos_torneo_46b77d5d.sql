-- =============================================================================
-- Semilla: 24 jugadores inscriptos en torneo 46b77d5d-fbea-4927-ad25-c154c151553b
-- Categoría Primera (categoria = 1) - Singles Masculino
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
  v_torneo_id  UUID  := '46b77d5d-fbea-4927-ad25-c154c151553b';
  v_club_id    UUID;
  v_jugador_id UUID;
  nombres_masculinos TEXT[] := ARRAY[
    'Bruno Acosta',     'Hernan Blanco',    'Damian Cardozo',   'Walter Espinoza',
    'Emanuel Fuentes',  'Rodrigo Gallardo', 'Ivan Heredia',     'Claudio Jimenez',
    'Marcos Lemos',     'Nicolas Montoya',  'Oscar Nunez',      'Tomas Ojeda',
    'Guillermo Palma',  'Ricardo Quiroga',  'Alejandro Rivero', 'Javier Salazar',
    'Mateo Torres',     'Leonardo Uribe',   'Fabian Valdes',    'Cristobal Zamora',
    'Horacio Benítez',  'Augusto Carrasco', 'Ramiro Delgado',   'Vicente Escobar'
  ];
  pts_ranking  INT[] := ARRAY[
    2500, 2430, 2360, 2310,
    2270, 2240, 2210, 2180,
    2150, 2120, 2090, 2060,
    2030, 2000, 1975, 1950,
    1920, 1895, 1870, 1845,
    1820, 1795, 1770, 1745
  ];
  i INT;
BEGIN
  -- Obtener el club_id del torneo
  SELECT club_id INTO v_club_id
  FROM torneos
  WHERE id = v_torneo_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el torneo con id % o no tiene club_id asignado.', v_torneo_id;
  END IF;

  FOR i IN 1..24 LOOP
    INSERT INTO perfiles (
      id,
      nombre_completo,
      sexo,
      categoria,
      categoria_singles,
      ranking_puntos,
      ranking_puntos_singles,
      es_admin,
      club_id
    )
    VALUES (
      gen_random_uuid(),
      nombres_masculinos[i],
      'Masculino',
      1,
      1,
      pts_ranking[i],
      pts_ranking[i],
      false,
      v_club_id
    )
    RETURNING id INTO v_jugador_id;

    INSERT INTO inscripciones (
      id,
      torneo_id,
      jugador_id,
      estado,
      estado_inscripcion,
      pago_confirmado,
      fecha_inscripcion,
      fecha_validacion,
      club_id
    )
    VALUES (
      gen_random_uuid(),
      v_torneo_id,
      v_jugador_id,
      'confirmada',
      'aprobada',
      true,
      NOW() - (INTERVAL '1 day' * (24 - i)),
      NOW() - (INTERVAL '1 day' * (24 - i)),
      v_club_id
    );
  END LOOP;

  RAISE NOTICE 'Se insertaron 24 jugadores y sus inscripciones en el torneo %.', v_torneo_id;
END $$;
