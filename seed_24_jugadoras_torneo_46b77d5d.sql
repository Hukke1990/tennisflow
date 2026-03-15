-- =============================================================================
-- Semilla: 24 jugadoras inscriptas en torneo 46b77d5d-fbea-4927-ad25-c154c151553b
-- Categoría Primera (categoria = 1) - Singles Femenino
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
  v_torneo_id  UUID  := '46b77d5d-fbea-4927-ad25-c154c151553b';
  v_club_id    UUID;
  v_jugador_id UUID;
  nombres_femeninos TEXT[] := ARRAY[
    'Valentina Acosta',   'Camila Blanco',     'Sofía Cardozo',     'Luciana Espinoza',
    'Florencia Fuentes',  'Martina Gallardo',  'Agustina Heredia',  'Carolina Jimenez',
    'Daniela Lemos',      'Natalia Montoya',   'Paola Nunez',       'Romina Ojeda',
    'Vanesa Palma',       'Lorena Quiroga',    'Alejandra Rivero',  'Silvana Salazar',
    'Micaela Torres',     'Leandra Uribe',     'Fabiana Valdes',    'Cristina Zamora',
    'Norma Benítez',      'Augustina Carrasco','Ramona Delgado',    'Victoria Escobar'
  ];
  pts_ranking  INT[] := ARRAY[
    2480, 2410, 2350, 2290,
    2255, 2220, 2190, 2165,
    2135, 2105, 2080, 2055,
    2025, 1995, 1968, 1942,
    1915, 1888, 1862, 1838,
    1812, 1787, 1762, 1738
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
      nombres_femeninos[i],
      'Femenino',
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

  RAISE NOTICE 'Se insertaron 24 jugadoras y sus inscripciones en el torneo %.', v_torneo_id;
END $$;
