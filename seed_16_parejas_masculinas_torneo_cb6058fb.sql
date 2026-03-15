-- =============================================================================
-- Semilla: 16 parejas masculinas inscriptas en torneo cb6058fb-f13d-4a54-9f1a-616dda4e3010
-- Categoría Primera (categoria = 1) - Dobles Masculino
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
  v_torneo_id  UUID := 'cb6058fb-f13d-4a54-9f1a-616dda4e3010';
  v_club_id    UUID;

  -- Jugador A de cada pareja
  nombres_a TEXT[] := ARRAY[
    'Bruno Acosta',     'Hernan Blanco',    'Damian Cardozo',   'Walter Espinoza',
    'Emanuel Fuentes',  'Rodrigo Gallardo', 'Ivan Heredia',     'Claudio Jimenez',
    'Marcos Lemos',     'Nicolas Montoya',  'Oscar Nunez',      'Tomas Ojeda',
    'Guillermo Palma',  'Ricardo Quiroga',  'Alejandro Rivero', 'Javier Salazar'
  ];

  -- Jugador B de cada pareja
  nombres_b TEXT[] := ARRAY[
    'Mateo Torres',    'Leonardo Uribe',   'Fabian Valdes',    'Cristobal Zamora',
    'Horacio Benitez', 'Augusto Carrasco', 'Ramiro Delgado',   'Vicente Escobar',
    'Franco Medina',   'Sebastian Pinto',  'Gonzalo Ramos',    'Agustin Sosa',
    'Luciano Vega',    'Maximiliano Cruz', 'Patricio Nieto',   'Fernando Ibarra'
  ];

  pts_ranking INT[] := ARRAY[
    2500, 2430, 2360, 2310,
    2270, 2240, 2210, 2180,
    2150, 2120, 2090, 2060,
    2030, 2000, 1975, 1950
  ];

  i          INT;
  v_id_a     UUID;
  v_id_b     UUID;
  v_pareja_id UUID;
BEGIN
  -- Obtener el club_id del torneo
  SELECT club_id INTO v_club_id
  FROM torneos
  WHERE id = v_torneo_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el torneo % o no tiene club_id asignado.', v_torneo_id;
  END IF;

  FOR i IN 1..16 LOOP

    -- Crear perfil jugador A
    INSERT INTO perfiles (
      id, nombre_completo, sexo, categoria, categoria_dobles,
      ranking_puntos, ranking_puntos_singles, es_admin, club_id
    )
    VALUES (
      gen_random_uuid(),
      nombres_a[i],
      'Masculino', 1, 1,
      pts_ranking[i], pts_ranking[i],
      false, v_club_id
    )
    RETURNING id INTO v_id_a;

    -- Crear perfil jugador B
    INSERT INTO perfiles (
      id, nombre_completo, sexo, categoria, categoria_dobles,
      ranking_puntos, ranking_puntos_singles, es_admin, club_id
    )
    VALUES (
      gen_random_uuid(),
      nombres_b[i],
      'Masculino', 1, 1,
      pts_ranking[i] - 30, pts_ranking[i] - 30,
      false, v_club_id
    )
    RETURNING id INTO v_id_b;

    -- UUID compartido que identifica la pareja
    v_pareja_id := gen_random_uuid();

    -- Inscripción jugador A
    INSERT INTO inscripciones (
      id, torneo_id, jugador_id, pareja_id, pareja_jugador_id,
      estado, estado_inscripcion, pago_confirmado,
      fecha_inscripcion, fecha_validacion, club_id
    )
    VALUES (
      gen_random_uuid(),
      v_torneo_id, v_id_a, v_pareja_id, v_id_b,
      'confirmada', 'aprobada', true,
      NOW() - (INTERVAL '1 day' * (16 - i)),
      NOW() - (INTERVAL '1 day' * (16 - i)),
      v_club_id
    );

    -- Inscripción jugador B (cruzada)
    INSERT INTO inscripciones (
      id, torneo_id, jugador_id, pareja_id, pareja_jugador_id,
      estado, estado_inscripcion, pago_confirmado,
      fecha_inscripcion, fecha_validacion, club_id
    )
    VALUES (
      gen_random_uuid(),
      v_torneo_id, v_id_b, v_pareja_id, v_id_a,
      'confirmada', 'aprobada', true,
      NOW() - (INTERVAL '1 day' * (16 - i)),
      NOW() - (INTERVAL '1 day' * (16 - i)),
      v_club_id
    );

  END LOOP;

  RAISE NOTICE 'Se insertaron 16 parejas (32 jugadores, 32 inscripciones) en el torneo %.', v_torneo_id;
END $$;
