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
  p_rama      TEXT    DEFAULT 'Masculino',
  p_categoria INTEGER DEFAULT 1,
  p_cupos     INTEGER DEFAULT 32  -- conservado por compatibilidad, ya no se almacena
) RETURNS UUID AS $$
DECLARE
  v_nombres TEXT[] := ARRAY[
    'Copa Relámpago',  'Torneo Express',   'Gran Prix',
    'Open Flash',      'Torneo Rayo',      'Copa Sprint',
    'Torneo Ágil',     'Open Rápido',      'Copa Veloz',
    'Torneo Relámpago'
  ];
  v_titulo    TEXT;
  v_id        UUID;
  v_cancha_id UUID;
BEGIN
  v_titulo :=
    v_nombres[1 + (random() * (array_length(v_nombres, 1) - 1))::int]
    || ' ' || p_rama
    || ' ' || to_char(NOW(), 'YYYY')
    || ' [TEST]';

  INSERT INTO torneos (
    id,
    titulo,
    costo,
    rama,
    modalidad,
    categoria_id,
    estado,
    fecha_inicio_inscripcion,
    fecha_cierre_inscripcion,
    fecha_inicio,
    fecha_fin,
    puntos_ronda_32,
    puntos_ronda_16,
    puntos_ronda_8,
    puntos_ronda_4,
    puntos_ronda_2,
    puntos_campeon,
    club_id
  ) VALUES (
    gen_random_uuid(),
    v_titulo,
    0.00,
    p_rama,
    'Singles',
    p_categoria,
    'abierto',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '3 days',
    NOW() + INTERVAL '17 days',
    5,   -- primera ronda
    10,  -- octavos
    25,  -- cuartos
    50,  -- semifinal
    80,  -- finalista
    100, -- campeón
    p_club_id
  ) RETURNING id INTO v_id;

  -- Buscar una cancha disponible del club; si no hay, crear una cancha [TEST]
  SELECT id INTO v_cancha_id
    FROM canchas
   WHERE club_id = p_club_id AND esta_disponible = true
   LIMIT 1;

  IF v_cancha_id IS NULL THEN
    INSERT INTO canchas (id, nombre, tipo_superficie, esta_disponible, en_mantenimiento, club_id)
    VALUES (gen_random_uuid(), 'Cancha Central [TEST]', 'Polvo de ladrillo', true, false, p_club_id)
    RETURNING id INTO v_cancha_id;
  END IF;

  -- Vincular la cancha al torneo
  INSERT INTO torneo_canchas (torneo_id, cancha_id)
  VALUES (v_id, v_cancha_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '[TEST] Torneo creado: % (id=%, cancha=%)', v_titulo, v_id, v_cancha_id;
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
      0, 0,
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
      0, 0,
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
  p_club_id   UUID,
  p_limite    INTEGER DEFAULT 32
) RETURNS INTEGER AS $$
DECLARE
  v_rama      TEXT;
  v_sexo      TEXT;
  v_inscritos INTEGER := 0;
BEGIN
  SELECT rama INTO v_rama FROM torneos WHERE id = p_torneo_id;

  IF v_rama IS NULL THEN
    RAISE EXCEPTION 'Torneo % no encontrado o sin rama definida', p_torneo_id;
  END IF;

  -- Mapeo rama → sexo del jugador
  v_sexo := CASE
    WHEN lower(v_rama) IN ('masculino', 'male', 'm') THEN 'Masculino'
    WHEN lower(v_rama) IN ('femenino', 'female', 'f') THEN 'Femenino'
    ELSE NULL   -- Mixto: sin filtro
  END;

  WITH candidatos AS (
    SELECT p.id AS jugador_id
      FROM perfiles p
     WHERE p.club_id = p_club_id
       AND p.nombre_completo LIKE '%[TEST]%'
       AND (v_sexo IS NULL OR p.sexo::text = v_sexo)
       AND NOT EXISTS (
             SELECT 1 FROM inscripciones i
              WHERE i.torneo_id = p_torneo_id AND i.jugador_id = p.id
           )
     ORDER BY p.nombre_completo
     LIMIT p_limite
  )
  INSERT INTO inscripciones (
    id, torneo_id, jugador_id, estado, estado_inscripcion,
    pago_confirmado, fecha_inscripcion, club_id
  )
  SELECT
    gen_random_uuid(), p_torneo_id, c.jugador_id,
    'confirmada', 'aprobada', true, NOW(), p_club_id
  FROM candidatos c;

  GET DIAGNOSTICS v_inscritos = ROW_COUNT;
  RAISE NOTICE '[TEST] % jugadores inscriptos en torneo % (rama: %)', v_inscritos, p_torneo_id, v_rama;
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
  v_rondas     INTEGER[];
  v_ronda      INTEGER;
  v_ronda_prev INTEGER;
  v_idx        INTEGER;
  v_ronda_min  INTEGER;
  v_scores     TEXT[] := ARRAY[
    '6-0 6-0', '6-1 6-2', '6-2 6-1', '6-3 6-0',
    '6-4 6-2', '6-4 6-3', '6-3 7-5', '7-5 6-3',
    '6-4 7-5', '7-5 6-4', '7-6 6-4', '6-4 7-6',
    '6-3 6-4 6-2', '6-4 3-6 6-3', '7-6 3-6 6-4'
  ];
  v_updated    INTEGER := 0;
  v_total      INTEGER := 0;
  v_campeon    TEXT;
  -- Configuración de puntos del torneo
  v_p32        INTEGER := 0;
  v_p16        INTEGER := 0;
  v_p8         INTEGER := 0;
  v_p4         INTEGER := 0;
  v_p2         INTEGER := 0;
  v_pc         INTEGER := 0;
BEGIN
  -- v_rondas = [32, 16, 8, 4, 2]: mayor ronda_orden = Primera Ronda, menor = Final
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

  FOR v_idx IN 1 .. array_length(v_rondas, 1) LOOP
    v_ronda := v_rondas[v_idx];

    -- Propagar ganadores por orden_en_ronda (el sorteo no guarda jugador_origen_partido_id)
    IF v_idx > 1 THEN
      v_ronda_prev := v_rondas[v_idx - 1];

      UPDATE partidos dest
         SET jugador1_id = (
               SELECT src.ganador_id
                 FROM partidos src
                WHERE src.torneo_id      = p_torneo_id
                  AND src.ronda_orden    = v_ronda_prev
                  AND src.orden_en_ronda = dest.orden_en_ronda * 2 - 1
                LIMIT 1
             ),
             jugador2_id = (
               SELECT src.ganador_id
                 FROM partidos src
                WHERE src.torneo_id      = p_torneo_id
                  AND src.ronda_orden    = v_ronda_prev
                  AND src.orden_en_ronda = dest.orden_en_ronda * 2
                LIMIT 1
             )
       WHERE dest.torneo_id   = p_torneo_id
         AND dest.ronda_orden = v_ronda;
    END IF;

    -- Asignar ganador y score aleatorios a los partidos con ambos jugadores definidos
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

  UPDATE torneos SET estado = 'finalizado' WHERE id = p_torneo_id;

  -- ──────────────────────────────────────────────────────────────────
  -- Otorgar puntos de ranking
  -- ──────────────────────────────────────────────────────────────────

  -- Leer configuración de puntos del torneo
  SELECT
    COALESCE(puntos_ronda_32, 0),
    COALESCE(puntos_ronda_16, 0),
    COALESCE(puntos_ronda_8,  0),
    COALESCE(puntos_ronda_4,  0),
    COALESCE(puntos_ronda_2,  0),
    COALESCE(puntos_campeon,  0)
  INTO v_p32, v_p16, v_p8, v_p4, v_p2, v_pc
  FROM torneos
  WHERE id = p_torneo_id;

  -- Actualizar metadatos de puntos en los partidos (espejo del controller de Node):
  --   ranking_puntos_otorgados   = puntos que alcanza el ganador (ronda siguiente o campeón)
  --   ranking_puntos_perdedor_…  = puntos del perdedor por su ronda
  UPDATE partidos
     SET ranking_puntos_jugador_id           = ganador_id,
         ranking_puntos_modalidad            = 'Singles',
         ranking_puntos_otorgados            = CASE ronda_orden
                                                 WHEN 2  THEN v_pc
                                                 WHEN 4  THEN v_p2
                                                 WHEN 8  THEN v_p4
                                                 WHEN 16 THEN v_p8
                                                 WHEN 32 THEN v_p16
                                                 ELSE 0
                                               END,
         ranking_puntos_perdedor_jugador_id  = CASE
                                                 WHEN ganador_id = jugador1_id THEN jugador2_id
                                                 ELSE jugador1_id
                                               END,
         ranking_puntos_perdedor_modalidad   = 'Singles',
         ranking_puntos_perdedor_otorgados   = CASE ronda_orden
                                                 WHEN 2  THEN v_p2
                                                 WHEN 4  THEN v_p4
                                                 WHEN 8  THEN v_p8
                                                 WHEN 16 THEN v_p16
                                                 WHEN 32 THEN v_p32
                                                 ELSE 0
                                               END
   WHERE torneo_id = p_torneo_id AND ganador_id IS NOT NULL;

  -- Actualizar ranking_puntos_singles:
  -- Perdedores → reciben los puntos de la ronda en que cayeron
  UPDATE perfiles pr
     SET ranking_puntos_singles = COALESCE(pr.ranking_puntos_singles, 0) + pts.puntos
    FROM (
           SELECT
             CASE WHEN ganador_id = jugador1_id THEN jugador2_id ELSE jugador1_id END AS jugador_id,
             CASE ronda_orden
               WHEN 2  THEN v_p2
               WHEN 4  THEN v_p4
               WHEN 8  THEN v_p8
               WHEN 16 THEN v_p16
               WHEN 32 THEN v_p32
               ELSE 0
             END AS puntos
           FROM partidos
          WHERE torneo_id = p_torneo_id AND ganador_id IS NOT NULL
         ) pts
   WHERE pr.id = pts.jugador_id;

  -- Campeón (nunca cae como perdedor) → recibe puntos_campeon
  UPDATE perfiles pr
     SET ranking_puntos_singles = COALESCE(pr.ranking_puntos_singles, 0) + v_pc
    FROM partidos pa
   WHERE pa.torneo_id   = p_torneo_id
     AND pa.ronda_orden = v_ronda_min
     AND pa.ganador_id  IS NOT NULL
     AND pr.id          = pa.ganador_id;

  -- Obtener nombre del campeón
  SELECT p.nombre_completo INTO v_campeon
    FROM partidos pa
    JOIN perfiles  p ON p.id = pa.ganador_id
   WHERE pa.torneo_id   = p_torneo_id
     AND pa.ronda_orden = v_ronda_min
   LIMIT 1;

  IF v_campeon IS NULL THEN
    RETURN format('OK: %s partidos completados. Campeón no determinado.', v_total);
  END IF;

  RETURN format('OK: %s partidos completados. 🏆 Campeón: %s', v_total, v_campeon);
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
  v_canchas   INTEGER := 0;
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

  -- 4) Vinculos cancha-torneo [TEST]
  DELETE FROM torneo_canchas
   WHERE torneo_id IN (
     SELECT id FROM torneos
      WHERE club_id = p_club_id
        AND titulo LIKE '%[TEST]%'
   );

  -- 5) Torneos [TEST]
  DELETE FROM torneos
   WHERE club_id = p_club_id
     AND titulo LIKE '%[TEST]%';
  GET DIAGNOSTICS v_torneos = ROW_COUNT;

  -- 6) Perfiles [TEST]
  DELETE FROM perfiles
   WHERE club_id = p_club_id
     AND nombre_completo LIKE '%[TEST]%';
  GET DIAGNOSTICS v_jugadores = ROW_COUNT;

  -- 7) Canchas [TEST] (solo las que se crearon por falta de canchas reales)
  DELETE FROM canchas
   WHERE club_id = p_club_id
     AND nombre LIKE '%[TEST]%';
  GET DIAGNOSTICS v_canchas = ROW_COUNT;

  RETURN format(
    'Limpieza completada: %s torneos, %s jugadores y %s canchas [TEST] eliminados del club %s.',
    v_torneos, v_jugadores, v_canchas, p_club_id
  );
END;
$$ LANGUAGE plpgsql;
