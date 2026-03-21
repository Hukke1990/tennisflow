-- test_automation.sql
-- =====================================================================
-- Suite de automatización de pruebas — TennisFlow
-- =====================================================================
-- ⚠️  EJECUTAR EN SUPABASE SQL EDITOR (requiere rol postgres/superuser)
--     Los perfiles se insertan directamente sin auth.users, igual que
--     los scripts seed_*.sql existentes del proyecto.
--     SOLO USAR EN ENTORNOS DE PRUEBA / STAGING.
-- =====================================================================
--
-- FUNCIONES DISPONIBLES:
--   1. crear_torneo_test(club_id, rama, categoria, cupos)  → UUID
--   2. generar_jugadores_test(club_id, cantidad_por_genero) → TEXT
--   3. inscribir_jugadores_test(torneo_id, club_id)        → INTEGER
--   4. autocompletar_cuadro_test(torneo_id)                → TEXT
--   5. limpiar_test(club_id)                               → TEXT
--
-- FLUJO TÍPICO:
--   1. SELECT limpiar_test('<CLUB_ID>');                    -- limpia pruebas anteriores
--   2. SELECT crear_torneo_test('<CLUB_ID>', 'Caballeros', 1, 32);  -- guarda el UUID retornado
--   3. SELECT generar_jugadores_test('<CLUB_ID>');          -- 32 + 32 jugadores
--   4. SELECT inscribir_jugadores_test('<TORNEO_ID>', '<CLUB_ID>');
--   5. [Desde la app o API: ejecutar el sorteo para el torneo]
--   6. SELECT autocompletar_cuadro_test('<TORNEO_ID>');
-- =====================================================================


/* =====================================================================
   1. crear_torneo_test
   Crea un torneo de prueba con nombre aleatorio + sufijo [TEST],
   fechas coherentes (inscripción abierta, inicio en 3 días),
   y lo deja en estado 'abierto' listo para inscribir y sortear.
   Retorna el UUID del torneo creado.
   ===================================================================== */
CREATE OR REPLACE FUNCTION crear_torneo_test(
  p_club_id   UUID,
  p_rama      TEXT    DEFAULT 'Caballeros',
  p_categoria INTEGER DEFAULT 1,
  p_cupos     INTEGER DEFAULT 32
) RETURNS UUID AS $$
DECLARE
  v_nombres TEXT[] := ARRAY[
    'Copa Relámpago',  'Torneo Express',   'Gran Prix',
    'Open Flash',      'Torneo Rayo',      'Copa Sprint',
    'Torneo Ágil',     'Open Rápido',      'Copa Veloz',
    'Torneo Relámpago'
  ];
  v_titulo TEXT;
  v_id     UUID;
BEGIN
  v_titulo :=
    v_nombres[1 + (random() * (array_length(v_nombres, 1) - 1))::int]
    || ' ' || p_rama
    || ' ' || to_char(NOW(), 'YYYY')
    || ' [TEST]';

  INSERT INTO torneos (
    id,
    titulo,
    cupos_max,
    costo,
    rama,
    modalidad,
    categoria_id,
    estado,
    fecha_inicio_inscripcion,
    fecha_cierre_inscripcion,
    fecha_inicio,
    fecha_fin,
    club_id
  ) VALUES (
    gen_random_uuid(),
    v_titulo,
    p_cupos,
    0.00,
    p_rama,
    'Singles',
    p_categoria,
    'abierto',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '3 days',
    NOW() + INTERVAL '17 days',
    p_club_id
  ) RETURNING id INTO v_id;

  RAISE NOTICE '[TEST] Torneo creado: % (id=%)', v_titulo, v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


/* =====================================================================
   2. generar_jugadores_test
   Inserta p_cantidad perfiles masculinos y p_cantidad femeninos
   con nombres reales argentinos. Todos llevan el sufijo "[TEST]"
   para poder identificarlos y limpiarlos después.
   Ranking y ELO se inicializan en 0. Categoría 1 (Primera).
   ===================================================================== */
CREATE OR REPLACE FUNCTION generar_jugadores_test(
  p_club_id  UUID,
  p_cantidad INTEGER DEFAULT 32
) RETURNS TEXT AS $$
DECLARE
  nombres_m TEXT[] := ARRAY[
    'Santiago Gomez',    'Matias Rodriguez',   'Agustin Lopez',     'Lucas Martinez',
    'Facundo Torres',    'Tomas Fernandez',    'Nicolas Ramirez',   'Ignacio Sanchez',
    'Ezequiel Diaz',     'Mauro Perez',        'Julian Castro',     'Rodrigo Vargas',
    'Franco Morales',    'Leandro Romero',     'Pablo Gutierrez',   'Diego Herrera',
    'Andres Mendoza',    'Gustavo Rios',       'Ariel Sosa',        'Cristian Silva',
    'Maximiliano Cruz',  'Sebastian Reyes',    'Federico Ortiz',    'Patricio Navarro',
    'Marcelo Flores',    'Esteban Molina',     'Sergio Ramos',      'Adrian Vega',
    'Ruben Medina',      'Carlos Mora',        'Rafael Dominguez',  'Gonzalo Ibarra'
  ];
  nombres_f TEXT[] := ARRAY[
    'Valentina Lopez',   'Camila Martinez',    'Florencia Garcia',  'Lucia Rodriguez',
    'Sofia Torres',      'Agustina Fernandez', 'Martina Sanchez',   'Catalina Diaz',
    'Julieta Romero',    'Antonella Perez',    'Yamila Castro',     'Paula Vargas',
    'Laura Morales',     'Ana Gutierrez',      'Soledad Herrera',   'Daniela Mendoza',
    'Carolina Rios',     'Micaela Sosa',       'Rocio Silva',       'Natalia Cruz',
    'Vanesa Reyes',      'Silvana Ortiz',      'Claudia Navarro',   'Lorena Flores',
    'Veronica Molina',   'Gloria Ramos',       'Andrea Vega',       'Estela Medina',
    'Norma Mora',        'Elena Dominguez',    'Patricia Ibarra',   'Monica Gomez'
  ];
  i         INT;
  v_lim_m   INT;
  v_lim_f   INT;
BEGIN
  v_lim_m := LEAST(p_cantidad, array_length(nombres_m, 1));
  v_lim_f := LEAST(p_cantidad, array_length(nombres_f, 1));

  -- Masculinos
  FOR i IN 1..v_lim_m LOOP
    INSERT INTO perfiles (
      id,
      nombre_completo,
      sexo,
      categoria,
      categoria_singles,
      categoria_dobles,
      ranking_elo,
      ranking_elo_singles,
      ranking_elo_dobles,
      ranking_puntos,
      ranking_puntos_singles,
      ranking_puntos_dobles,
      es_admin,
      rol,
      club_id
    ) VALUES (
      gen_random_uuid(),
      nombres_m[i] || ' [TEST]',
      'Masculino',
      1, 1, 1,
      0, 0, 0,
      0, 0, 0,
      false, 'jugador',
      p_club_id
    );
  END LOOP;

  -- Femeninos
  FOR i IN 1..v_lim_f LOOP
    INSERT INTO perfiles (
      id,
      nombre_completo,
      sexo,
      categoria,
      categoria_singles,
      categoria_dobles,
      ranking_elo,
      ranking_elo_singles,
      ranking_elo_dobles,
      ranking_puntos,
      ranking_puntos_singles,
      ranking_puntos_dobles,
      es_admin,
      rol,
      club_id
    ) VALUES (
      gen_random_uuid(),
      nombres_f[i] || ' [TEST]',
      'Femenino',
      1, 1, 1,
      0, 0, 0,
      0, 0, 0,
      false, 'jugador',
      p_club_id
    );
  END LOOP;

  RETURN format(
    'OK: %s masculinos + %s femeninos creados en club %s [TEST]',
    v_lim_m, v_lim_f, p_club_id
  );
END;
$$ LANGUAGE plpgsql;


/* =====================================================================
   3. inscribir_jugadores_test
   Toma los perfiles [TEST] del club, filtra por sexo según la rama
   del torneo (Caballeros → Masculino, Damas → Femenino, otro → todos),
   y los inscribe hasta completar el cupo máximo.
   Inscripciones: estado='confirmada', estado_inscripcion='aprobada',
   pago_confirmado=true.
   Retorna el número de inscripciones creadas.
   ===================================================================== */
CREATE OR REPLACE FUNCTION inscribir_jugadores_test(
  p_torneo_id UUID,
  p_club_id   UUID
) RETURNS INTEGER AS $$
DECLARE
  v_rama       TEXT;
  v_cupos      INTEGER;
  v_sexo       TEXT;
  v_existentes INTEGER := 0;
  v_faltantes  INTEGER;
  v_inscritos  INTEGER := 0;
BEGIN
  SELECT rama, cupos_max
    INTO v_rama, v_cupos
    FROM torneos
   WHERE id = p_torneo_id;

  IF v_rama IS NULL THEN
    RAISE EXCEPTION 'Torneo % no encontrado o sin rama definida', p_torneo_id;
  END IF;

  -- Mapeo rama → sexo del jugador
  v_sexo := CASE
    WHEN v_rama = 'Caballeros' THEN 'Masculino'
    WHEN v_rama = 'Damas'      THEN 'Femenino'
    ELSE NULL   -- Mixto: sin filtro
  END;

  SELECT COUNT(*) INTO v_existentes
    FROM inscripciones
   WHERE torneo_id = p_torneo_id;

  v_faltantes := COALESCE(v_cupos, 32) - v_existentes;

  IF v_faltantes <= 0 THEN
    RAISE NOTICE '[TEST] El torneo % ya está lleno (% inscriptos)', p_torneo_id, v_existentes;
    RETURN 0;
  END IF;

  WITH candidatos AS (
    SELECT p.id AS jugador_id
      FROM perfiles p
     WHERE p.club_id              = p_club_id
       AND p.nombre_completo LIKE '%[TEST]%'
       AND (v_sexo IS NULL OR p.sexo::text = v_sexo)
       AND NOT EXISTS (
             SELECT 1 FROM inscripciones i
              WHERE i.torneo_id  = p_torneo_id
                AND i.jugador_id = p.id
           )
     ORDER BY p.nombre_completo
     LIMIT v_faltantes
  )
  INSERT INTO inscripciones (
    id,
    torneo_id,
    jugador_id,
    estado,
    estado_inscripcion,
    pago_confirmado,
    fecha_inscripcion,
    club_id
  )
  SELECT
    gen_random_uuid(),
    p_torneo_id,
    c.jugador_id,
    'confirmada',
    'aprobada',
    true,
    NOW(),
    p_club_id
  FROM candidatos c;

  GET DIAGNOSTICS v_inscritos = ROW_COUNT;

  RAISE NOTICE '[TEST] % jugadores inscriptos en torneo % (rama: %, cupo: %/%)',
    v_inscritos, p_torneo_id, v_rama, v_existentes + v_inscritos, v_cupos;

  RETURN v_inscritos;
END;
$$ LANGUAGE plpgsql;


/* =====================================================================
   4. autocompletar_cuadro_test
   Recorre las rondas del cuadro de mayor a menor ronda_orden
   (Primera Ronda → ... → Final):
     • Propaga el ganador de cada partido origen a la ronda siguiente
       usando jugador1_origen_partido_id / jugador2_origen_partido_id.
     • Asigna un ganador aleatorio y un score aleatorio a cada partido
       que tenga ambos jugadores definidos.
   Al finalizar marca el torneo como 'finalizado'.

   PRERREQUISITO: el sorteo debe haberse ejecutado desde la app/API
   (POST /torneos/:id/sorteo) para que los partidos existan con sus
   jugadores en la primera ronda.

   Retorna un mensaje con el número de partidos completados y el campeón.
   ===================================================================== */
CREATE OR REPLACE FUNCTION autocompletar_cuadro_test(
  p_torneo_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_rondas   INTEGER[];
  v_ronda    INTEGER;
  v_ronda_min INTEGER;
  v_scores   TEXT[] := ARRAY[
    '6-0 6-0', '6-1 6-2', '6-2 6-1', '6-3 6-0',
    '6-4 6-2', '6-4 6-3', '6-3 7-5', '7-5 6-3',
    '6-4 7-5', '7-5 6-4', '7-6 6-4', '6-4 7-6',
    '6-3 6-4 6-2', '6-4 3-6 6-3', '7-6 3-6 6-4'
  ];
  v_updated  INTEGER := 0;
  v_total    INTEGER := 0;
  v_campeon  TEXT;
BEGIN
  -- Rondas ordenadas de MAYOR a MENOR (Primera Ronda primero, Final al final)
  SELECT ARRAY_AGG(ro ORDER BY ro DESC), MIN(ro)
    INTO v_rondas, v_ronda_min
    FROM (
      SELECT DISTINCT ronda_orden AS ro
        FROM partidos
       WHERE torneo_id = p_torneo_id
    ) t;

  IF v_rondas IS NULL THEN
    RETURN 'Error: no se encontraron partidos. ¿Ejecutaste el sorteo primero?';
  END IF;

  FOREACH v_ronda IN ARRAY v_rondas LOOP
    -- Paso 1: Propagar ganadores de la ronda origen a esta ronda.
    --   jugador1_origen_partido_id/jugador2_origen_partido_id apuntan al
    --   partido de la ronda anterior del que proviene cada jugador.
    --   Para la Primera Ronda estos campos son NULL → nada que propagar.
    UPDATE partidos
       SET jugador1_id = COALESCE(
             (SELECT ganador_id FROM partidos src
               WHERE src.id = partidos.jugador1_origen_partido_id),
             jugador1_id
           ),
           jugador2_id = COALESCE(
             (SELECT ganador_id FROM partidos src
               WHERE src.id = partidos.jugador2_origen_partido_id),
             jugador2_id
           )
     WHERE torneo_id   = p_torneo_id
       AND ronda_orden = v_ronda
       AND (
         jugador1_origen_partido_id IS NOT NULL
         OR jugador2_origen_partido_id IS NOT NULL
       );

    -- Paso 2: Completar partidos con ganador y score aleatorios.
    --   Se usa random() por fila (función VOLATILE): cada partido
    --   recibe un ganador y un score independientes.
    UPDATE partidos
       SET ganador_id = CASE
                          WHEN random() > 0.5 THEN jugador1_id
                          ELSE jugador2_id
                        END,
           estado     = 'finalizado',
           score      = v_scores[1 + (random() * (array_length(v_scores, 1) - 1))::int]
     WHERE torneo_id   = p_torneo_id
       AND ronda_orden = v_ronda
       AND jugador1_id IS NOT NULL
       AND jugador2_id IS NOT NULL
       AND ganador_id  IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_total := v_total + v_updated;
  END LOOP;

  -- Marcar torneo como finalizado
  UPDATE torneos SET estado = 'finalizado' WHERE id = p_torneo_id;

  -- Obtener el campeón (ganador del partido Final = ronda_orden mínimo)
  SELECT p.nombre_completo INTO v_campeon
    FROM partidos pa
    JOIN perfiles  p ON p.id = pa.ganador_id
   WHERE pa.torneo_id  = p_torneo_id
     AND pa.ronda_orden = v_ronda_min
   LIMIT 1;

  IF v_campeon IS NULL THEN
    RETURN format(
      'OK: %s partidos completados. Campeón no determinado (¿cuadro vacío o sin jugadores?).',
      v_total
    );
  END IF;

  RETURN format('OK: %s partidos completados. Campeón: %s', v_total, v_campeon);
END;
$$ LANGUAGE plpgsql;


/* =====================================================================
   5. limpiar_test
   Elimina todos los datos de prueba asociados al club indicado:
     • Partidos de torneos [TEST]
     • Inscripciones de torneos [TEST]
     • Inscripciones residuales de jugadores [TEST] en otros torneos
     • Torneos [TEST]
     • Perfiles [TEST]
   Retorna un resumen de lo eliminado.
   ===================================================================== */
CREATE OR REPLACE FUNCTION limpiar_test(
  p_club_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_torneos   INTEGER := 0;
  v_jugadores INTEGER := 0;
BEGIN
  -- 1) Partidos de torneos [TEST] del club
  DELETE FROM partidos
   WHERE torneo_id IN (
     SELECT id FROM torneos
      WHERE club_id = p_club_id
        AND titulo LIKE '%[TEST]%'
   );

  -- 2) Inscripciones de torneos [TEST]
  DELETE FROM inscripciones
   WHERE torneo_id IN (
     SELECT id FROM torneos
      WHERE club_id = p_club_id
        AND titulo LIKE '%[TEST]%'
   );

  -- 3) Inscripciones residuales de jugadores [TEST] en otros torneos
  DELETE FROM inscripciones
   WHERE jugador_id IN (
     SELECT id FROM perfiles
      WHERE club_id = p_club_id
        AND nombre_completo LIKE '%[TEST]%'
   );

  -- 4) Torneos [TEST]
  DELETE FROM torneos
   WHERE club_id = p_club_id
     AND titulo LIKE '%[TEST]%';
  GET DIAGNOSTICS v_torneos = ROW_COUNT;

  -- 5) Perfiles [TEST]
  --    Se hace después de borrar los partidos que los referenciaban
  DELETE FROM perfiles
   WHERE club_id = p_club_id
     AND nombre_completo LIKE '%[TEST]%';
  GET DIAGNOSTICS v_jugadores = ROW_COUNT;

  RETURN format(
    'Limpieza completada: %s torneos [TEST] y %s jugadores [TEST] eliminados del club %s.',
    v_torneos, v_jugadores, p_club_id
  );
END;
$$ LANGUAGE plpgsql;
