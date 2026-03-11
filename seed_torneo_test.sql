-- seed_torneo_test.sql
-- Carga jugadores existentes en un torneo para test rapido.
--
-- Que hace:
-- 1) Completa inscripciones confirmadas/pago_confirmado=true hasta objetivo.
-- 2) Genera disponibilidad_inscripcion para cada dia del torneo.
-- 3) No duplica inscripciones ni disponibilidades existentes.
--
-- Uso:
-- - Reemplaza v_torneo por el ID del torneo.
-- - Ajusta v_objetivo o usa cupo_max con v_usar_cupo_max = true.
-- - Ejecuta todo el bloque en Supabase SQL Editor.

DO $$
DECLARE
  v_torneo uuid := '66662158-24f6-4eb4-b155-abf1246d383d';
  v_objetivo integer := 8; -- Ignorado si v_usar_cupo_max = true
  v_usar_cupo_max boolean := true;
  v_hora_inicio time := '09:00';
  v_hora_fin time := '22:00';

  v_inicio date;
  v_fin date;
  v_objetivo_final integer;
  v_inscritos_confirmados integer;
  v_faltan integer;
BEGIN
  SELECT
    COALESCE(date(fecha_inicio), current_date),
    COALESCE(date(fecha_fin), date(fecha_inicio), current_date),
    COALESCE(cupos_max, 0)
  INTO v_inicio, v_fin, v_objetivo_final
  FROM torneos
  WHERE id = v_torneo;

  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'No existe torneo con id=%', v_torneo;
  END IF;

  IF v_fin < v_inicio THEN
    v_fin := v_inicio;
  END IF;

  IF NOT v_usar_cupo_max THEN
    v_objetivo_final := GREATEST(v_objetivo, 0);
  END IF;

  SELECT COUNT(*)
  INTO v_inscritos_confirmados
  FROM inscripciones i
  WHERE i.torneo_id = v_torneo
    AND COALESCE(i.estado, 'confirmada') = 'confirmada'
    AND COALESCE(i.pago_confirmado, false) = true;

  v_faltan := GREATEST(v_objetivo_final - v_inscritos_confirmados, 0);

  -- 1) Insertar jugadores faltantes (si existen perfiles disponibles)
  WITH candidatos AS (
    SELECT p.id AS jugador_id
    FROM perfiles p
    WHERE NOT EXISTS (
      SELECT 1
      FROM inscripciones i
      WHERE i.torneo_id = v_torneo
        AND i.jugador_id = p.id
    )
    ORDER BY p.nombre_completo ASC, p.id ASC
    LIMIT v_faltan
  )
  INSERT INTO inscripciones (torneo_id, jugador_id, estado, pago_confirmado, fecha_inscripcion)
  SELECT v_torneo, c.jugador_id, 'confirmada', true, now()
  FROM candidatos c
  ON CONFLICT (torneo_id, jugador_id) DO UPDATE
  SET estado = 'confirmada',
      pago_confirmado = true;

  -- 2) Asegurar que TODAS las inscripciones del torneo queden confirmadas para test
  UPDATE inscripciones
  SET estado = 'confirmada',
      pago_confirmado = true
  WHERE torneo_id = v_torneo;

  -- 3) Crear disponibilidad diaria para cada inscrito confirmado (si no existe ya)
  WITH fechas AS (
    SELECT generate_series(v_inicio::timestamp, v_fin::timestamp, interval '1 day')::date AS fecha
  ),
  jugadores AS (
    SELECT i.jugador_id
    FROM inscripciones i
    WHERE i.torneo_id = v_torneo
      AND COALESCE(i.estado, 'confirmada') = 'confirmada'
      AND COALESCE(i.pago_confirmado, false) = true
  ),
  faltantes AS (
    SELECT
      v_torneo AS torneo_id,
      j.jugador_id,
      f.fecha,
      EXTRACT(DOW FROM f.fecha)::smallint AS dia_semana,
      v_hora_inicio AS hora_inicio,
      v_hora_fin AS hora_fin
    FROM jugadores j
    CROSS JOIN fechas f
    WHERE NOT EXISTS (
      SELECT 1
      FROM disponibilidad_inscripcion di
      WHERE di.torneo_id = v_torneo
        AND di.jugador_id = j.jugador_id
        AND di.fecha = f.fecha
    )
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
    torneo_id,
    jugador_id,
    fecha,
    dia_semana,
    hora_inicio,
    hora_fin,
    false
  FROM faltantes;

  RAISE NOTICE 'Torneo % listo para test. Objetivo=% inscritos_confirmados=% rango_fechas=%..%',
    v_torneo,
    v_objetivo_final,
    (SELECT COUNT(*) FROM inscripciones WHERE torneo_id = v_torneo AND COALESCE(estado, 'confirmada') = 'confirmada' AND COALESCE(pago_confirmado, false) = true),
    v_inicio,
    v_fin;
END $$;

-- Resumen rapido
SELECT
  t.id,
  t.titulo,
  t.cupos_max,
  COUNT(*) FILTER (
    WHERE COALESCE(i.estado, 'confirmada') = 'confirmada'
      AND COALESCE(i.pago_confirmado, false) = true
  ) AS inscritos_confirmados,
  COUNT(DISTINCT di.jugador_id) AS jugadores_con_disponibilidad,
  COUNT(*) FILTER (WHERE di.id IS NOT NULL) AS filas_disponibilidad
FROM torneos t
LEFT JOIN inscripciones i ON i.torneo_id = t.id
LEFT JOIN disponibilidad_inscripcion di ON di.torneo_id = t.id
WHERE t.id = '66662158-24f6-4eb4-b155-abf1246d383d'
GROUP BY t.id, t.titulo, t.cupos_max;