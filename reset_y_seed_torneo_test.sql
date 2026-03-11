-- reset_y_seed_torneo_test.sql
-- Reinicia un torneo de prueba y lo vuelve a poblar con jugadores/disponibilidad.
--
-- ADVERTENCIA: este script BORRA partidos, inscripciones y disponibilidades
-- del torneo indicado, y luego vuelve a cargar datos para test.

DO $$
DECLARE
  v_torneo uuid := '66662158-24f6-4eb4-b155-abf1246d383d';

  -- Seed config
  v_usar_cupo_max boolean := true;
  v_objetivo integer := 8; -- usado solo si v_usar_cupo_max = false
  v_hora_inicio time := '09:00';
  v_hora_fin time := '22:00';

  -- Internos
  v_inicio date;
  v_fin date;
  v_cupo_max integer;
  v_objetivo_final integer;
  v_titulo text;
BEGIN
  -- 0) Validar torneo
  SELECT
    titulo,
    COALESCE(date(fecha_inicio), current_date),
    COALESCE(date(fecha_fin), date(fecha_inicio), current_date),
    COALESCE(cupos_max, 0)
  INTO v_titulo, v_inicio, v_fin, v_cupo_max
  FROM torneos
  WHERE id = v_torneo;

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'No existe torneo con id=%', v_torneo;
  END IF;

  IF v_fin < v_inicio THEN
    v_fin := v_inicio;
  END IF;

  v_objetivo_final := CASE
    WHEN v_usar_cupo_max THEN GREATEST(v_cupo_max, 0)
    ELSE GREATEST(v_objetivo, 0)
  END;

  -- 1) RESET completo del torneo
  DELETE FROM disponibilidad_inscripcion
  WHERE torneo_id = v_torneo;

  DELETE FROM inscripciones
  WHERE torneo_id = v_torneo;

  DELETE FROM partidos
  WHERE torneo_id = v_torneo;

  -- Dejar torneo listo para volver a usar en test
  UPDATE torneos
  SET estado = 'publicado'
  WHERE id = v_torneo;

  -- 2) Seed de inscripciones (jugadores existentes)
  WITH candidatos AS (
    SELECT p.id AS jugador_id
    FROM perfiles p
    WHERE COALESCE(p.es_admin, false) = false
    ORDER BY p.nombre_completo ASC, p.id ASC
    LIMIT v_objetivo_final
  )
  INSERT INTO inscripciones (torneo_id, jugador_id, estado, pago_confirmado, fecha_inscripcion)
  SELECT v_torneo, c.jugador_id, 'confirmada', true, now()
  FROM candidatos c
  ON CONFLICT (torneo_id, jugador_id) DO UPDATE
  SET estado = 'confirmada',
      pago_confirmado = true;

  -- 3) Seed de disponibilidad por cada dia del torneo
  WITH fechas AS (
    SELECT generate_series(v_inicio::timestamp, v_fin::timestamp, interval '1 day')::date AS fecha
  ),
  jugadores AS (
    SELECT i.jugador_id
    FROM inscripciones i
    WHERE i.torneo_id = v_torneo
      AND COALESCE(i.estado, 'confirmada') = 'confirmada'
      AND COALESCE(i.pago_confirmado, false) = true
  )
  INSERT INTO disponibilidad_inscripcion (
    torneo_id,
    jugador_id,
    fecha,
    dia_semana,
    hora_inicio,
    hora_fin,
    es_obligatoria_fin_semana
  )
  SELECT
    v_torneo,
    j.jugador_id,
    f.fecha,
    EXTRACT(DOW FROM f.fecha)::smallint,
    v_hora_inicio,
    v_hora_fin,
    false
  FROM jugadores j
  CROSS JOIN fechas f;

  RAISE NOTICE 'Torneo reseteado y sembrado: % (%). Objetivo=% rango=%..%',
    v_titulo, v_torneo, v_objetivo_final, v_inicio, v_fin;
END $$;

-- Resumen rapido final
SELECT
  t.id,
  t.titulo,
  t.estado,
  t.cupos_max,
  COUNT(DISTINCT i.jugador_id) AS inscripciones_total,
  COUNT(DISTINCT i.jugador_id) FILTER (
    WHERE COALESCE(i.estado, 'confirmada') = 'confirmada'
      AND COALESCE(i.pago_confirmado, false) = true
  ) AS inscritos_confirmados,
  COUNT(DISTINCT di.jugador_id) AS jugadores_con_disponibilidad,
  COUNT(p.id) AS partidos_generados
FROM torneos t
LEFT JOIN inscripciones i ON i.torneo_id = t.id
LEFT JOIN disponibilidad_inscripcion di ON di.torneo_id = t.id
LEFT JOIN partidos p ON p.torneo_id = t.id
WHERE t.id = '66662158-24f6-4eb4-b155-abf1246d383d'
GROUP BY t.id, t.titulo, t.estado, t.cupos_max;