-- =============================================================================
-- Semilla: 32 jugadores inscriptos en torneo ca6e87e8-797f-49b1-80c0-8e8277aebba6
-- Categoría Primera (categoria = 1)
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
  v_torneo_id  UUID  := 'ca6e87e8-797f-49b1-80c0-8e8277aebba6';
  v_club_id    UUID;
  v_jugador_id UUID;
  nombres_masculinos TEXT[] := ARRAY[
    'Santiago Gomez',  'Matias Rodriguez',  'Agustin Lopez',   'Lucas Martinez',
    'Facundo Torres',  'Tomas Fernandez',   'Nicolas Ramirez', 'Ignacio Sanchez',
    'Ezequiel Diaz',   'Mauro Perez',       'Julian Castro',   'Rodrigo Vargas',
    'Franco Morales',  'Leandro Romero',    'Pablo Gutierrez', 'Diego Herrera',
    'Andres Mendoza',  'Gustavo Rios',      'Ariel Sosa',      'Cristian Silva',
    'Maximiliano Cruz','Sebastian Reyes',   'Federico Ortiz',  'Patricio Navarro',
    'Marcelo Flores',  'Esteban Molina',    'Sergio Ramos',    'Adrian Vega',
    'Ruben Medina',    'Carlos Mora',       'Rafael Dominguez','Gonzalo Ibarra'
  ];
  pts_ranking  INT[] := ARRAY[
    2450, 2380, 2310, 2295,
    2240, 2220, 2195, 2170,
    2140, 2110, 2095, 2080,
    2060, 2040, 2020, 1995,
    1970, 1950, 1930, 1910,
    1895, 1875, 1860, 1840,
    1820, 1800, 1785, 1760,
    1740, 1720, 1700, 1680
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

  FOR i IN 1..32 LOOP
    -- Crear perfil del jugador con ranking real (mayor índice = peor ranking)
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

    -- Inscribir al jugador en el torneo como aprobado
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
      NOW() - (INTERVAL '1 day' * (32 - i)),  -- fechas escalonadas
      NOW() - (INTERVAL '1 day' * (32 - i)),
      v_club_id
    );
  END LOOP;

  RAISE NOTICE 'Se insertaron 32 jugadores y sus inscripciones en el torneo %.', v_torneo_id;
END $$;
