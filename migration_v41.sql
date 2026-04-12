-- Migration v41: Seguridad RPCs, transacción de partido, idempotencia webhook avanzada
-- Ejecutar en Supabase SQL Editor

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  FASE 1 — Seguridad RPCs existentes                          
-- ║                                                              
-- ║  inscribir_jugador_atomico tenía GRANT a anon + authenticated ║
-- ║  lo que permite llamarla directo desde PostgREST sin pasar   ║
-- ║  por el Node.js backend. Se restringe a service_role only.   ║
-- ║  Además: SET search_path para prevenir schema injection.     ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1a. Revocar permisos anon/authenticated en RPC de inscripción
REVOKE EXECUTE ON FUNCTION public.inscribir_jugador_atomico(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, JSONB)
  FROM anon, authenticated;

-- 1b. Recrear inscribir_jugador_atomico con search_path fijado (anti-injection)
CREATE OR REPLACE FUNCTION public.inscribir_jugador_atomico(
  p_club_id           UUID,
  p_torneo_id         UUID,
  p_jugador_id        UUID,
  p_pareja_jugador_id UUID,
  p_pareja_id         UUID,
  p_estado            TEXT,
  p_estado_inscripcion TEXT,
  p_disponibilidad    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_insc_id  UUID;
  v_insc_id2 UUID;
  v_err_code TEXT;
  v_err_msg  TEXT;
  v_franja   JSONB;
BEGIN
  INSERT INTO public.inscripciones (
    club_id, torneo_id, jugador_id,
    pareja_id, pareja_jugador_id,
    estado, estado_inscripcion, pago_confirmado
  )
  VALUES (
    p_club_id, p_torneo_id, p_jugador_id,
    p_pareja_id, p_pareja_jugador_id,
    p_estado, p_estado_inscripcion, FALSE
  )
  RETURNING id INTO v_insc_id;

  IF p_pareja_jugador_id IS NOT NULL THEN
    INSERT INTO public.inscripciones (
      club_id, torneo_id, jugador_id,
      pareja_id, pareja_jugador_id,
      estado, estado_inscripcion, pago_confirmado
    )
    VALUES (
      p_club_id, p_torneo_id, p_pareja_jugador_id,
      p_pareja_id, p_jugador_id,
      p_estado, p_estado_inscripcion, FALSE
    )
    RETURNING id INTO v_insc_id2;
  END IF;

  DELETE FROM public.disponibilidad_inscripcion
  WHERE torneo_id = p_torneo_id
    AND jugador_id = ANY(
      CASE
        WHEN p_pareja_jugador_id IS NOT NULL THEN ARRAY[p_jugador_id, p_pareja_jugador_id]
        ELSE ARRAY[p_jugador_id]
      END
    );

  FOR v_franja IN SELECT * FROM jsonb_array_elements(p_disponibilidad)
  LOOP
    INSERT INTO public.disponibilidad_inscripcion (
      torneo_id, jugador_id, fecha, dia_semana, hora_inicio, hora_fin, es_obligatoria_fin_semana
    )
    VALUES (
      p_torneo_id,
      (v_franja->>'jugador_id')::UUID,
      (v_franja->>'fecha')::DATE,
      (v_franja->>'dia_semana')::INT,
      v_franja->>'hora_inicio',
      v_franja->>'hora_fin',
      COALESCE((v_franja->>'es_obligatoria_fin_semana')::BOOLEAN, FALSE)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'inscripcion_id',  v_insc_id,
    'inscripcion_id2', v_insc_id2
  );

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object('ok', FALSE, 'error_code', '23505', 'error_msg', v_err_msg);
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object('ok', FALSE, 'error_code', v_err_code, 'error_msg', v_err_msg);
END;
$$;

-- Solo service_role puede ejecutar esta función
GRANT EXECUTE ON FUNCTION public.inscribir_jugador_atomico(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, JSONB)
  TO service_role;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  FASE 3 — Idempotencia avanzada en log_pagos                 
-- ║                                                              
-- ║  Problema v40: UNIQUE(mp_resource_id, mp_topic) deduplicaba  
-- ║  eventos con DISTINTO action (created vs updated vs cancelled)║
-- ║  del mismo recurso. Se añade mp_action para granularidad.    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 3a. Columnas nuevas en log_pagos
ALTER TABLE public.log_pagos
  ADD COLUMN IF NOT EXISTS mp_action        TEXT NOT NULL DEFAULT 'notification',
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS fail_reason       TEXT;

-- 3b. Reemplazar constraint de 2 columnas por constraint de 3 columnas
DO $$
BEGIN
  -- Eliminar constraint anterior (2 columnas)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'log_pagos_mp_resource_id_unique'
      AND conrelid = 'public.log_pagos'::regclass
  ) THEN
    ALTER TABLE public.log_pagos DROP CONSTRAINT log_pagos_mp_resource_id_unique;
  END IF;

  -- Añadir nuevo constraint (3 columnas)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'log_pagos_resource_topic_action_unique'
      AND conrelid = 'public.log_pagos'::regclass
  ) THEN
    ALTER TABLE public.log_pagos
      ADD CONSTRAINT log_pagos_resource_topic_action_unique
      UNIQUE (mp_resource_id, mp_topic, mp_action);
  END IF;
END $$;

-- 3c. Índice para consultas de webhooks fallidos
CREATE INDEX IF NOT EXISTS log_pagos_processing_status_idx
  ON public.log_pagos (processing_status)
  WHERE processing_status = 'failed';

-- 3d. Actualizar RPC procesar_webhook_mp con: search_path + mp_action param + v40 fix
CREATE OR REPLACE FUNCTION public.procesar_webhook_mp(
  p_mp_resource_id    TEXT,
  p_mp_topic         TEXT,
  p_mp_action        TEXT,            -- NUEVO: distingue created/updated/etc.
  p_club_id          UUID,
  p_new_status       TEXT,
  p_plan_id          TEXT,
  p_preapproval_id   TEXT,
  p_payer_email      TEXT,
  p_next_payment_date TEXT,
  p_should_activate  BOOLEAN,
  p_pending_plan_id  TEXT,
  p_plan_anterior    TEXT,
  p_action_taken     TEXT,
  p_raw_body         JSONB,
  p_ip_address       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_existing_id UUID;
  v_err_msg     TEXT;
BEGIN
  -- Idempotencia: (resource_id + topic + action) como clave compuesta
  SELECT id INTO v_existing_id
  FROM public.log_pagos
  WHERE mp_resource_id = p_mp_resource_id
    AND mp_topic       = p_mp_topic
    AND mp_action      = p_mp_action
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'skipped', TRUE, 'log_id', v_existing_id);
  END IF;

  -- A) UPSERT suscripciones
  INSERT INTO public.suscripciones (
    club_id, plan_id, preapproval_id, status,
    next_payment_date, payer_email, external_reference, pending_plan_id
  )
  VALUES (
    p_club_id, p_plan_id, p_preapproval_id, p_new_status,
    p_next_payment_date::TIMESTAMPTZ, p_payer_email, p_club_id::TEXT, p_pending_plan_id
  )
  ON CONFLICT (club_id) DO UPDATE
    SET plan_id           = EXCLUDED.plan_id,
        preapproval_id    = EXCLUDED.preapproval_id,
        status            = EXCLUDED.status,
        next_payment_date = EXCLUDED.next_payment_date,
        payer_email       = EXCLUDED.payer_email,
        pending_plan_id   = EXCLUDED.pending_plan_id,
        updated_at        = NOW();

  -- B) UPDATE clubes (solo si debe activarse)
  IF p_should_activate AND p_club_id IS NOT NULL THEN
    UPDATE public.clubes
    SET plan       = p_plan_id,
        is_active  = TRUE,
        updated_at = NOW()
    WHERE id = p_club_id;
  END IF;

  -- C) INSERT log_pagos (clave de idempotencia incluye mp_action)
  INSERT INTO public.log_pagos (
    club_id, mp_resource_id, mp_topic, mp_action, mp_status, mp_raw_status,
    action_taken, plan_anterior, plan_nuevo, raw_body, ip_address, processing_status
  )
  VALUES (
    p_club_id, p_mp_resource_id, p_mp_topic, p_mp_action, p_new_status, p_new_status,
    p_action_taken, p_plan_anterior,
    CASE WHEN p_should_activate THEN p_plan_id ELSE p_plan_anterior END,
    p_raw_body, p_ip_address, 'ok'
  );

  RETURN jsonb_build_object('ok', TRUE, 'skipped', FALSE);

EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object('ok', FALSE, 'error_msg', v_err_msg);
END;
$$;

GRANT EXECUTE ON FUNCTION public.procesar_webhook_mp TO service_role;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  FASE 2 — RPC: rpc_finalizar_partido_atomico                 
-- ║                                                              
-- ║  Encapsula en UNA transacción PostgreSQL:                    
-- ║    A) UPDATE partidos (resultado, ganador, estado)           
-- ║    B) ELO calculation + UPDATE perfiles                      
-- ║    C) ranking_impact_applied = TRUE                          
-- ║    D) Propagación de ganador a siguiente ronda               
-- ║                                                              
-- ║  Retorna JSONB con:                                          
-- ║    { ok, partido, ranking_impact, propagation }              
-- ╚══════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.rpc_finalizar_partido_atomico(
  p_partido_id       UUID,
  p_ganador_id       UUID,
  p_resultado        TEXT DEFAULT NULL,
  p_score            TEXT DEFAULT NULL,
  p_marcador_en_vivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  -- Partido
  v_partido             RECORD;
  v_partido_json        JSONB;
  v_perdedor_id         UUID;
  v_ganador_pareja_id   UUID;
  v_perdedor_pareja_id  UUID;

  -- Torneo
  v_torneo              RECORD;
  v_modalidad           TEXT;
  v_ranking_field       TEXT;

  -- ELO variables
  v_winner_elo          NUMERIC;
  v_loser_elo           NUMERIC;
  v_winner_partner_elo  NUMERIC;
  v_loser_partner_elo   NUMERIC;
  v_team_winner         NUMERIC;
  v_team_loser          NUMERIC;
  v_winner_new_elo      INT;
  v_loser_new_elo       INT;
  v_winner_partner_new_elo INT;
  v_loser_partner_new_elo  INT;
  v_elo_applied         BOOLEAN := FALSE;
  v_elo_reason          TEXT    := 'no_aplicado';

  -- Propagación
  v_next_ronda_orden    INT;
  v_current_index       INT;
  v_target_index        INT;
  v_is_left_slot        BOOLEAN;
  v_next_partido_id     UUID;
  v_siguiente_partido_json JSONB;
  v_torneo_finalizado   BOOLEAN := FALSE;
  v_ronda_label         TEXT;

  -- Return
  v_ranking_impact_json JSONB;
BEGIN
  -- ── A. Obtener y bloquear el partido ─────────────────────────────────────
  SELECT * INTO v_partido
  FROM public.partidos
  WHERE id = p_partido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'partido_no_encontrado');
  END IF;

  IF v_partido.estado = 'finalizado' AND v_partido.ganador_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',        FALSE,
      'error',     'partido_ya_finalizado',
      'ganador_id', v_partido.ganador_id
    );
  END IF;

  -- ── B. Calcular derivados del ganador ─────────────────────────────────────
  v_perdedor_id := CASE
    WHEN v_partido.jugador1_id = p_ganador_id THEN v_partido.jugador2_id
    ELSE v_partido.jugador1_id
  END;

  v_ganador_pareja_id := CASE
    WHEN v_partido.jugador1_id = p_ganador_id THEN v_partido.jugador1_pareja_id
    ELSE v_partido.jugador2_pareja_id
  END;

  v_perdedor_pareja_id := CASE
    WHEN v_partido.jugador1_id = p_ganador_id THEN v_partido.jugador2_pareja_id
    ELSE v_partido.jugador1_pareja_id
  END;

  -- ── C. UPDATE de partido ──────────────────────────────────────────────────
  UPDATE public.partidos
  SET estado             = 'finalizado',
      ganador_id         = p_ganador_id,
      ganador_pareja_id  = v_ganador_pareja_id,
      resultado          = COALESCE(p_resultado,        resultado),
      score              = COALESCE(p_score,            score),
      marcador_en_vivo   = COALESCE(p_marcador_en_vivo, marcador_en_vivo),
      ultima_actualizacion = NOW()
  WHERE id = p_partido_id;

  -- ── D. Fetch torneo para modalidad ────────────────────────────────────────
  SELECT id, modalidad, rama, categoria_id
  INTO v_torneo
  FROM public.torneos
  WHERE id = v_partido.torneo_id;

  IF NOT FOUND OR v_perdedor_id IS NULL THEN
    -- Sin torneo o sin oponente: no aplicar ELO, continuar
    v_elo_reason := CASE WHEN NOT FOUND THEN 'torneo_no_disponible' ELSE 'partido_sin_dos_jugadores' END;
  ELSE
    v_modalidad     := COALESCE(v_torneo.modalidad, 'Singles');
    v_ranking_field := CASE
      WHEN v_modalidad ILIKE '%doble%' THEN 'ranking_elo_dobles'
      ELSE 'ranking_elo_singles'
    END;

    -- ── E. ELO calculation ──────────────────────────────────────────────────
    IF v_ranking_field = 'ranking_elo_dobles'
       AND v_ganador_pareja_id IS NOT NULL
       AND v_perdedor_pareja_id IS NOT NULL THEN

      -- ────── DOBLES (4 jugadores, equipo rating) ─────────────────────────
      SELECT COALESCE(ranking_elo_dobles, ranking_elo, 1200) INTO v_winner_elo
        FROM public.perfiles WHERE id = p_ganador_id;
      SELECT COALESCE(ranking_elo_dobles, ranking_elo, 1200) INTO v_loser_elo
        FROM public.perfiles WHERE id = v_perdedor_id;
      SELECT COALESCE(ranking_elo_dobles, ranking_elo, 1200) INTO v_winner_partner_elo
        FROM public.perfiles WHERE id = v_ganador_pareja_id;
      SELECT COALESCE(ranking_elo_dobles, ranking_elo, 1200) INTO v_loser_partner_elo
        FROM public.perfiles WHERE id = v_perdedor_pareja_id;

      v_team_winner := ROUND((v_winner_elo + v_winner_partner_elo) / 2.0);
      v_team_loser  := ROUND((v_loser_elo  + v_loser_partner_elo)  / 2.0);

      v_winner_new_elo         := ROUND(v_winner_elo         + 32.0 * (1.0 - 1.0 / (1.0 + POWER(10.0, (v_team_loser  - v_winner_elo)         / 400.0))));
      v_winner_partner_new_elo := ROUND(v_winner_partner_elo + 32.0 * (1.0 - 1.0 / (1.0 + POWER(10.0, (v_team_loser  - v_winner_partner_elo) / 400.0))));
      v_loser_new_elo          := ROUND(v_loser_elo          + 32.0 * (0.0 - 1.0 / (1.0 + POWER(10.0, (v_team_winner - v_loser_elo)          / 400.0))));
      v_loser_partner_new_elo  := ROUND(v_loser_partner_elo  + 32.0 * (0.0 - 1.0 / (1.0 + POWER(10.0, (v_team_winner - v_loser_partner_elo)  / 400.0))));

      UPDATE public.perfiles
      SET ranking_elo_dobles = v_winner_new_elo,
          ranking_elo        = v_winner_new_elo
      WHERE id = p_ganador_id;

      UPDATE public.perfiles
      SET ranking_elo_dobles = v_winner_partner_new_elo,
          ranking_elo        = v_winner_partner_new_elo
      WHERE id = v_ganador_pareja_id;

      UPDATE public.perfiles
      SET ranking_elo_dobles = v_loser_new_elo,
          ranking_elo        = v_loser_new_elo
      WHERE id = v_perdedor_id;

      UPDATE public.perfiles
      SET ranking_elo_dobles = v_loser_partner_new_elo,
          ranking_elo        = v_loser_partner_new_elo
      WHERE id = v_perdedor_pareja_id;

      v_elo_applied := TRUE;
      v_ranking_impact_json := jsonb_build_object(
        'applied',        TRUE,
        'modalidad',      'Dobles',
        'ranking_field',  v_ranking_field,
        'torneo_config',  to_jsonb(v_torneo),
        'ganador',         jsonb_build_object('id', p_ganador_id,       'before', v_winner_elo,         'after', v_winner_new_elo),
        'ganador_pareja',  jsonb_build_object('id', v_ganador_pareja_id, 'before', v_winner_partner_elo, 'after', v_winner_partner_new_elo),
        'perdedor',        jsonb_build_object('id', v_perdedor_id,       'before', v_loser_elo,          'after', v_loser_new_elo),
        'perdedor_pareja', jsonb_build_object('id', v_perdedor_pareja_id,'before', v_loser_partner_elo,  'after', v_loser_partner_new_elo)
      );

    ELSE
      -- ────── SINGLES (2 jugadores) ────────────────────────────────────────
      SELECT COALESCE(ranking_elo_singles, ranking_elo, 1200) INTO v_winner_elo
        FROM public.perfiles WHERE id = p_ganador_id;
      SELECT COALESCE(ranking_elo_singles, ranking_elo, 1200) INTO v_loser_elo
        FROM public.perfiles WHERE id = v_perdedor_id;

      v_winner_new_elo := ROUND(v_winner_elo + 32.0 * (1.0 - 1.0 / (1.0 + POWER(10.0, (v_loser_elo  - v_winner_elo) / 400.0))));
      v_loser_new_elo  := ROUND(v_loser_elo  + 32.0 * (0.0 - 1.0 / (1.0 + POWER(10.0, (v_winner_elo - v_loser_elo)  / 400.0))));

      UPDATE public.perfiles
      SET ranking_elo_singles = v_winner_new_elo,
          ranking_elo         = v_winner_new_elo
      WHERE id = p_ganador_id;

      UPDATE public.perfiles
      SET ranking_elo_singles = v_loser_new_elo,
          ranking_elo         = v_loser_new_elo
      WHERE id = v_perdedor_id;

      v_elo_applied := TRUE;
      v_ranking_impact_json := jsonb_build_object(
        'applied',       TRUE,
        'modalidad',     'Singles',
        'ranking_field', v_ranking_field,
        'torneo_config', to_jsonb(v_torneo),
        'ganador',        jsonb_build_object('id', p_ganador_id,  'before', v_winner_elo, 'after', v_winner_new_elo),
        'perdedor',       jsonb_build_object('id', v_perdedor_id, 'before', v_loser_elo,  'after', v_loser_new_elo)
      );
    END IF;
  END IF;

  -- Ranking impact fallback si ELO no se aplicó
  IF NOT v_elo_applied THEN
    v_ranking_impact_json := jsonb_build_object('applied', FALSE, 'reason', v_elo_reason);
  END IF;

  -- ── F. Marcar ranking_impact_applied ─────────────────────────────────────
  UPDATE public.partidos
  SET ranking_impact_applied = v_elo_applied
  WHERE id = p_partido_id;

  -- ── G. Obtener estado final del partido ───────────────────────────────────
  SELECT to_jsonb(p) INTO v_partido_json
  FROM public.partidos p
  WHERE id = p_partido_id;

  -- ── H. Propagación del ganador ────────────────────────────────────────────
  IF v_partido.ronda_orden <= 2 THEN
    -- Final: marcar torneo como finalizado
    UPDATE public.torneos
    SET estado = 'finalizado'
    WHERE id = v_partido.torneo_id;

    v_torneo_finalizado := TRUE;
  ELSE
    v_next_ronda_orden := v_partido.ronda_orden / 2;
    v_current_index    := GREATEST(COALESCE(v_partido.orden_en_ronda, 1) - 1, 0);
    v_target_index     := v_current_index / 2;
    v_is_left_slot     := (v_current_index % 2) = 0;

    -- Buscar partido de siguiente ronda en la posición target
    SELECT sub.id INTO v_next_partido_id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY COALESCE(orden_en_ronda, 999999) ASC, id::text ASC
             ) - 1 AS pos
      FROM public.partidos
      WHERE torneo_id  = v_partido.torneo_id
        AND ronda_orden = v_next_ronda_orden
    ) sub
    WHERE sub.pos = v_target_index;

    -- Crear placeholder si no existe
    IF v_next_partido_id IS NULL THEN
      v_ronda_label := CASE
        WHEN v_next_ronda_orden = 2  THEN 'Final'
        WHEN v_next_ronda_orden = 4  THEN 'Semifinal'
        WHEN v_next_ronda_orden = 8  THEN 'Cuartos de Final'
        WHEN v_next_ronda_orden = 16 THEN 'Octavos de Final'
        WHEN v_next_ronda_orden = 32 THEN 'Primera Ronda'
        ELSE 'Ronda de ' || v_next_ronda_orden
      END;

      INSERT INTO public.partidos (torneo_id, ronda, ronda_orden, estado, orden_en_ronda)
      VALUES (v_partido.torneo_id, v_ronda_label, v_next_ronda_orden, 'programado', v_target_index + 1)
      RETURNING id INTO v_next_partido_id;
    END IF;

    -- Actualizar el slot correcto del siguiente partido
    IF v_is_left_slot THEN
      UPDATE public.partidos
      SET jugador1_id                 = p_ganador_id,
          jugador1_pareja_id          = v_ganador_pareja_id,
          jugador1_origen_partido_id  = p_partido_id,
          estado = CASE WHEN estado = 'finalizado' THEN estado ELSE 'programado' END
      WHERE id = v_next_partido_id;
    ELSE
      UPDATE public.partidos
      SET jugador2_id                 = p_ganador_id,
          jugador2_pareja_id          = v_ganador_pareja_id,
          jugador2_origen_partido_id  = p_partido_id,
          estado = CASE WHEN estado = 'finalizado' THEN estado ELSE 'programado' END
      WHERE id = v_next_partido_id;
    END IF;

    SELECT to_jsonb(p) INTO v_siguiente_partido_json
    FROM public.partidos p
    WHERE id = v_next_partido_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',             TRUE,
    'partido',        v_partido_json,
    'ranking_impact', v_ranking_impact_json,
    'propagation',    jsonb_build_object(
      'torneo_finalizado',  v_torneo_finalizado,
      'siguiente_partido',  v_siguiente_partido_json
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    DECLARE v_err TEXT;
    BEGIN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      RETURN jsonb_build_object('ok', FALSE, 'error', 'excepcion_interna', 'detail', v_err);
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_finalizar_partido_atomico(UUID, UUID, TEXT, TEXT, TEXT)
  TO service_role;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  EXTRA: Índice para webhooks fallidos por processing_status  ║
-- ╚══════════════════════════════════════════════════════════════╝
CREATE INDEX IF NOT EXISTS log_pagos_action_idx
  ON public.log_pagos (mp_action);
