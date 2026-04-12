-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION v42 — Validación de Tenant en RPCs (FASE 2 hardening)   ║
-- ║                                                                      ║
-- ║  Objetivo: defense-in-depth — cada RPC SECURITY DEFINER valida       ║
-- ║  que el caller opera sobre datos de su propio club.                  ║
-- ║                                                                      ║
-- ║  Cambios:                                                            ║
-- ║    1. inscribir_jugador_atomico  → valida torneo.club_id = p_club_id ║
-- ║    2. rpc_finalizar_partido_atomico → p_calling_club_id opcional;    ║
-- ║       si se pasa, valida que partido pertenezca al club              ║
-- ║    3. procesar_webhook_mp → valida que p_club_id exista en clubes    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. inscribir_jugador_atomico — con validación de tenant
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- ── Validación de tenant: el torneo debe pertenecer al club indicado ────────
  IF NOT EXISTS (
    SELECT 1 FROM public.torneos
    WHERE id       = p_torneo_id
      AND club_id  = p_club_id
  ) THEN
    RETURN jsonb_build_object(
      'ok',         FALSE,
      'error_code', 'TENANT_MISMATCH',
      'error_msg',  'El torneo no pertenece al club indicado'
    );
  END IF;

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

GRANT EXECUTE ON FUNCTION public.inscribir_jugador_atomico(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, JSONB)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. procesar_webhook_mp — validar que p_club_id exista en clubes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.procesar_webhook_mp(
  p_mp_resource_id    TEXT,
  p_mp_topic         TEXT,
  p_mp_action        TEXT,
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
  -- ── Validación de tenant: si se proporciona club_id, debe existir ─────────
  IF p_club_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.clubes WHERE id = p_club_id) THEN
      RETURN jsonb_build_object(
        'ok',         FALSE,
        'error_code', 'CLUB_NOT_FOUND',
        'error_msg',  'Club no encontrado para el external_reference recibido'
      );
    END IF;
  END IF;

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

  -- B) UPDATE clubes
  IF p_should_activate AND p_club_id IS NOT NULL THEN
    UPDATE public.clubes
    SET plan       = p_plan_id,
        is_active  = TRUE,
        updated_at = NOW()
    WHERE id = p_club_id;
  END IF;

  -- C) INSERT log_pagos
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_finalizar_partido_atomico — agregar p_calling_club_id para tenant check
--    El parámetro es opcional (DEFAULT NULL) → compatibilidad con callers viejos.
--    Si se provee, valida que el partido pertenezca al torneo del club caller.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_finalizar_partido_atomico(
  p_partido_id       UUID,
  p_ganador_id       UUID,
  p_resultado        TEXT DEFAULT NULL,
  p_score            TEXT DEFAULT NULL,
  p_marcador_en_vivo TEXT DEFAULT NULL,
  p_calling_club_id  UUID DEFAULT NULL   -- opcional; activa validación de tenant
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
  -- ── Validación de tenant (solo si se proporcionó p_calling_club_id) ────────
  IF p_calling_club_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.partidos pa
      JOIN public.torneos  t  ON t.id = pa.torneo_id
      WHERE pa.id         = p_partido_id
        AND t.club_id     = p_calling_club_id
    ) THEN
      RETURN jsonb_build_object(
        'ok',         FALSE,
        'error',      'TENANT_MISMATCH',
        'error_msg',  'El partido no pertenece a un torneo de este club'
      );
    END IF;
  END IF;

  -- ── A. Obtener y bloquear el partido ──────────────────────────────────────
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

  -- ── C. Obtener torneo ─────────────────────────────────────────────────────
  SELECT * INTO v_torneo FROM public.torneos WHERE id = v_partido.torneo_id;

  v_modalidad    := v_torneo.modalidad;
  v_ranking_field := CASE
    WHEN v_modalidad IN ('singles', 'singles_femenino')  THEN 'ranking_elo_singles'
    WHEN v_modalidad IN ('dobles',  'dobles_femenino')   THEN 'ranking_elo_dobles'
    WHEN v_modalidad IN ('mixto')                        THEN 'ranking_elo_mixto'
    ELSE 'ranking_elo_singles'
  END;

  -- ── D. UPDATE partido ─────────────────────────────────────────────────────
  UPDATE public.partidos
  SET ganador_id          = p_ganador_id,
      estado              = 'finalizado',
      resultado           = COALESCE(p_resultado, resultado),
      score               = COALESCE(p_score, score),
      marcador_en_vivo    = COALESCE(p_marcador_en_vivo, marcador_en_vivo),
      ranking_impact_applied = FALSE,
      updated_at          = NOW()
  WHERE id = p_partido_id;

  -- ── E. ELO calculation ────────────────────────────────────────────────────
  IF v_modalidad IN ('dobles', 'dobles_femenino', 'mixto') THEN
    -- Dobles: ELO de equipo como promedio de la pareja
    SELECT COALESCE(ranking_elo_dobles, 1000) INTO v_winner_elo
      FROM public.perfiles WHERE id = p_ganador_id;
    SELECT COALESCE(ranking_elo_dobles, 1000) INTO v_loser_elo
      FROM public.perfiles WHERE id = v_perdedor_id;

    IF v_ganador_pareja_id IS NOT NULL THEN
      SELECT COALESCE(ranking_elo_dobles, 1000) INTO v_winner_partner_elo
        FROM public.perfiles WHERE id = v_ganador_pareja_id;
    ELSE
      v_winner_partner_elo := v_winner_elo;
    END IF;

    IF v_perdedor_pareja_id IS NOT NULL THEN
      SELECT COALESCE(ranking_elo_dobles, 1000) INTO v_loser_partner_elo
        FROM public.perfiles WHERE id = v_perdedor_pareja_id;
    ELSE
      v_loser_partner_elo := v_loser_elo;
    END IF;

    v_team_winner := (v_winner_elo + v_winner_partner_elo) / 2.0;
    v_team_loser  := (v_loser_elo  + v_loser_partner_elo)  / 2.0;

    DECLARE
      K_FACTOR       CONSTANT NUMERIC := 32;
      v_expected_win NUMERIC;
    BEGIN
      v_expected_win := 1.0 / (1.0 + POWER(10, (v_team_loser - v_team_winner) / 400.0));

      v_winner_new_elo         := ROUND(v_winner_elo         + K_FACTOR * (1 - v_expected_win));
      v_loser_new_elo          := ROUND(v_loser_elo          + K_FACTOR * (0 - (1 - v_expected_win)));
      v_winner_partner_new_elo := ROUND(v_winner_partner_elo + K_FACTOR * (1 - v_expected_win));
      v_loser_partner_new_elo  := ROUND(v_loser_partner_elo  + K_FACTOR * (0 - (1 - v_expected_win)));

      -- Actualizar todos los jugadores
      UPDATE public.perfiles
        SET ranking_elo_dobles = GREATEST(v_winner_new_elo, 100), updated_at = NOW()
        WHERE id = p_ganador_id;
      UPDATE public.perfiles
        SET ranking_elo_dobles = GREATEST(v_loser_new_elo,  100), updated_at = NOW()
        WHERE id = v_perdedor_id;
      IF v_ganador_pareja_id IS NOT NULL THEN
        UPDATE public.perfiles
          SET ranking_elo_dobles = GREATEST(v_winner_partner_new_elo, 100), updated_at = NOW()
          WHERE id = v_ganador_pareja_id;
      END IF;
      IF v_perdedor_pareja_id IS NOT NULL THEN
        UPDATE public.perfiles
          SET ranking_elo_dobles = GREATEST(v_loser_partner_new_elo, 100), updated_at = NOW()
          WHERE id = v_perdedor_pareja_id;
      END IF;

      v_elo_applied := TRUE;
      v_elo_reason  := 'dobles_elo_calculado';
    END;

  ELSIF v_modalidad IN ('singles', 'singles_femenino') OR v_modalidad IS NULL THEN
    DECLARE
      K_FACTOR       CONSTANT NUMERIC := 32;
      v_expected_win NUMERIC;
    BEGIN
      SELECT COALESCE(ranking_elo_singles, 1000) INTO v_winner_elo
        FROM public.perfiles WHERE id = p_ganador_id;
      SELECT COALESCE(ranking_elo_singles, 1000) INTO v_loser_elo
        FROM public.perfiles WHERE id = v_perdedor_id;

      v_expected_win   := 1.0 / (1.0 + POWER(10, (v_loser_elo - v_winner_elo) / 400.0));
      v_winner_new_elo := ROUND(v_winner_elo + K_FACTOR * (1 - v_expected_win));
      v_loser_new_elo  := ROUND(v_loser_elo  + K_FACTOR * (0 - (1 - v_expected_win)));

      UPDATE public.perfiles
        SET ranking_elo_singles = GREATEST(v_winner_new_elo, 100), updated_at = NOW()
        WHERE id = p_ganador_id;
      UPDATE public.perfiles
        SET ranking_elo_singles = GREATEST(v_loser_new_elo, 100), updated_at = NOW()
        WHERE id = v_perdedor_id;

      v_elo_applied := TRUE;
      v_elo_reason  := 'singles_elo_calculado';
    END;
  END IF;

  -- Marcar ranking_impact_applied
  UPDATE public.partidos
    SET ranking_impact_applied = TRUE
    WHERE id = p_partido_id AND v_elo_applied;

  -- ── F. Propagación de ganador a siguiente ronda ───────────────────────────
  v_siguiente_partido_json := NULL;
  v_torneo_finalizado := FALSE;

  IF v_partido.ronda_orden IS NOT NULL AND v_partido.posicion_en_ronda IS NOT NULL THEN
    v_next_ronda_orden := v_partido.ronda_orden + 1;
    v_current_index    := v_partido.posicion_en_ronda;
    v_target_index     := (v_current_index - 1) / 2 + 1;
    v_is_left_slot     := (v_current_index % 2 = 1);

    SELECT id INTO v_next_partido_id
    FROM public.partidos
    WHERE torneo_id        = v_partido.torneo_id
      AND ronda_orden      = v_next_ronda_orden
      AND posicion_en_ronda = v_target_index
    LIMIT 1;

    IF v_next_partido_id IS NOT NULL THEN
      IF v_is_left_slot THEN
        UPDATE public.partidos
          SET jugador1_id       = p_ganador_id,
              jugador1_pareja_id = v_ganador_pareja_id,
              updated_at = NOW()
          WHERE id = v_next_partido_id;
      ELSE
        UPDATE public.partidos
          SET jugador2_id       = p_ganador_id,
              jugador2_pareja_id = v_ganador_pareja_id,
              updated_at = NOW()
          WHERE id = v_next_partido_id;
      END IF;

      SELECT jsonb_build_object(
        'id',            id,
        'ronda_orden',   ronda_orden,
        'posicion',      posicion_en_ronda,
        'jugador1_id',   jugador1_id,
        'jugador2_id',   jugador2_id
      ) INTO v_siguiente_partido_json
      FROM public.partidos WHERE id = v_next_partido_id;

    ELSE
      -- No hay siguiente partido → es la final
      v_torneo_finalizado := TRUE;
      -- Obtener etiqueta de la ronda más alta
      SELECT COALESCE(label, 'Final') INTO v_ronda_label
      FROM public.rondas
      WHERE torneo_id   = v_partido.torneo_id
        AND orden       = v_partido.ronda_orden
      LIMIT 1;

      IF v_ronda_label IN ('Final', 'FINAL', 'final') OR
         NOT EXISTS (
           SELECT 1 FROM public.partidos
           WHERE torneo_id   = v_partido.torneo_id
             AND ronda_orden = v_next_ronda_orden
         ) THEN
        UPDATE public.torneos
          SET estado     = 'finalizado',
              updated_at = NOW()
          WHERE id = v_partido.torneo_id;
      END IF;
    END IF;
  END IF;

  -- ── G. Obtener partido actualizado para respuesta ──────────────────────────
  SELECT row_to_json(p)::JSONB INTO v_partido_json
  FROM public.partidos p WHERE id = p_partido_id;

  v_ranking_impact_json := jsonb_build_object(
    'applied',          v_elo_applied,
    'reason',           v_elo_reason,
    'winner_new_elo',   v_winner_new_elo,
    'loser_new_elo',    v_loser_new_elo
  );

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'partido',           v_partido_json,
    'ranking_impact',    v_ranking_impact_json,
    'propagation',       jsonb_build_object(
      'siguiente_partido',  v_siguiente_partido_json,
      'torneo_finalizado',  v_torneo_finalizado
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    DECLARE
      v_sqlerrm TEXT;
    BEGIN
      GET STACKED DIAGNOSTICS v_sqlerrm = MESSAGE_TEXT;
      RETURN jsonb_build_object('ok', FALSE, 'error', v_sqlerrm);
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_finalizar_partido_atomico(UUID, UUID, TEXT, TEXT, TEXT, UUID)
  TO service_role;
