-- Migration v40: Hardening — transaccionalidad, idempotencia y consistencia eventual
-- Ejecutar en Supabase SQL Editor

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  1. UNIQUE constraint en inscripciones (torneo_id, jugador_id)
-- ║     Garantiza idempotencia a nivel DB (error 23505 controlado)
-- ╚══════════════════════════════════════════════════════════════╝
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inscripciones_torneo_jugador_unique'
      AND conrelid = 'public.inscripciones'::regclass
  ) THEN
    ALTER TABLE public.inscripciones
      ADD CONSTRAINT inscripciones_torneo_jugador_unique
      UNIQUE (torneo_id, jugador_id);
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  2. Columna ranking_impact_applied en partidos               
-- ║     Permite detectar y reprocesar partidos con ELO pendiente  
-- ╚══════════════════════════════════════════════════════════════╝
ALTER TABLE public.partidos
  ADD COLUMN IF NOT EXISTS ranking_impact_applied BOOLEAN NOT NULL DEFAULT FALSE;

-- Marcar partidos ya finalizados como procesados (para no reejecutar ELO histórico)
UPDATE public.partidos
SET ranking_impact_applied = TRUE
WHERE estado = 'finalizado'
  AND ganador_id IS NOT NULL
  AND ranking_impact_applied = FALSE;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  3. UNIQUE en log_pagos(mp_resource_id) — evita doble audit  
-- ╚══════════════════════════════════════════════════════════════╝
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'log_pagos_mp_resource_id_unique'
      AND conrelid = 'public.log_pagos'::regclass
  ) THEN
    ALTER TABLE public.log_pagos
      ADD CONSTRAINT log_pagos_mp_resource_id_unique
      UNIQUE (mp_resource_id, mp_topic);
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  4. RPC: inscribir_jugador_atomico                           
-- ║     Encapsula en una transacción:                             
-- ║       A) INSERT en inscripciones (1 o 2 filas)                
-- ║       B) DELETE disponibilidad_inscripcion previa             
-- ║       C) INSERT disponibilidad_inscripcion nueva              
-- ║     Retorna:                                                  
-- ║       { ok, inscripcion_id, error_code, error_msg }           
-- ╚══════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.inscribir_jugador_atomico(
  p_club_id          UUID,
  p_torneo_id        UUID,
  p_jugador_id       UUID,
  p_pareja_jugador_id UUID,        -- NULL para singles
  p_pareja_id        UUID,         -- NULL para singles
  p_estado           TEXT,
  p_estado_inscripcion TEXT,
  p_disponibilidad   JSONB         -- array de franjas: [{jugador_id, torneo_id, fecha, dia_semana, hora_inicio, hora_fin}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_insc_id   UUID;
  v_insc_id2  UUID;
  v_err_code  TEXT;
  v_err_msg   TEXT;
  v_franja    JSONB;
BEGIN
  -- ── Paso A: INSERT inscripcion principal ─────────────────────────
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

  -- ── Paso A2 (dobles): INSERT inscripcion de la pareja ────────────
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

  -- ── Paso B: DELETE disponibilidad previa de todos los jugadores ──
  DELETE FROM public.disponibilidad_inscripcion
  WHERE torneo_id = p_torneo_id
    AND jugador_id = ANY(
      CASE
        WHEN p_pareja_jugador_id IS NOT NULL THEN ARRAY[p_jugador_id, p_pareja_jugador_id]
        ELSE ARRAY[p_jugador_id]
      END
    );

  -- ── Paso C: INSERT nueva disponibilidad ─────────────────────────
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
    'inscripcion_id2', v_insc_id2,
    'error_code',      NULL,
    'error_msg',       NULL
  );

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object(
      'ok',         FALSE,
      'error_code', '23505',
      'error_msg',  v_err_msg
    );
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object(
      'ok',         FALSE,
      'error_code', v_err_code,
      'error_msg',  v_err_msg
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inscribir_jugador_atomico TO anon, authenticated, service_role;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  5. RPC: procesar_webhook_mp                                 
-- ║     Idempotente: si mp_resource_id ya existe en log_pagos    
-- ║     para ese topic, retorna { ok: true, skipped: true }       
-- ║     sin modificar estado.                                      
-- ║     Si no existe → UPSERT suscripciones + UPDATE clubes       
-- ║     + INSERT log_pagos dentro de una transacción.             
-- ╚══════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.procesar_webhook_mp(
  p_mp_resource_id   TEXT,
  p_mp_topic         TEXT,
  p_club_id          UUID,
  p_new_status       TEXT,            -- 'authorized' | 'paused' | 'cancelled' | 'pending'
  p_plan_id          TEXT,            -- 'basico' | 'pro' | 'premium' | 'test'
  p_preapproval_id   TEXT,
  p_payer_email      TEXT,
  p_next_payment_date TEXT,           -- ISO string or NULL
  p_should_activate  BOOLEAN,         -- TRUE cuando status = 'authorized'
  p_pending_plan_id  TEXT,            -- 'basico' cuando downgrade diferido
  p_plan_anterior    TEXT,
  p_action_taken     TEXT,
  p_raw_body         JSONB,
  p_ip_address       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id  UUID;
  v_err_msg      TEXT;
BEGIN
  -- ── Idempotencia: verificar si ya fue procesado ──────────────────
  SELECT id INTO v_existing_id
  FROM public.log_pagos
  WHERE mp_resource_id = p_mp_resource_id
    AND mp_topic       = p_mp_topic
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'skipped', TRUE, 'log_id', v_existing_id);
  END IF;

  -- ── Procesar dentro de transacción ──────────────────────────────

  -- A) UPSERT suscripciones
  INSERT INTO public.suscripciones (
    club_id, plan_id, preapproval_id, status,
    next_payment_date, payer_email, external_reference,
    pending_plan_id
  )
  VALUES (
    p_club_id, p_plan_id, p_preapproval_id, p_new_status,
    p_next_payment_date::TIMESTAMPTZ, p_payer_email, p_club_id::TEXT,
    p_pending_plan_id
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
    SET plan      = p_plan_id,
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = p_club_id;
  END IF;

  -- C) INSERT log_pagos (clave de idempotencia)
  INSERT INTO public.log_pagos (
    club_id, mp_resource_id, mp_topic, mp_status, mp_raw_status,
    action_taken, plan_anterior, plan_nuevo, raw_body, ip_address
  )
  VALUES (
    p_club_id, p_mp_resource_id, p_mp_topic, p_new_status, p_new_status,
    p_action_taken, p_plan_anterior,
    CASE WHEN p_should_activate THEN p_plan_id ELSE p_plan_anterior END,
    p_raw_body, p_ip_address
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
-- ║  6. Vista: partidos_con_elo_pendiente                         
-- ║     Permite al script de reparación encontrar partidos         
-- ║     finalizados con ranking_impact_applied = FALSE              
-- ╚══════════════════════════════════════════════════════════════╝
CREATE OR REPLACE VIEW public.partidos_con_elo_pendiente AS
SELECT
  p.id,
  p.torneo_id,
  p.jugador1_id,
  p.jugador2_id,
  p.jugador1_pareja_id,
  p.jugador2_pareja_id,
  p.ganador_id,
  p.estado,
  p.ranking_impact_applied,
  p.updated_at
FROM public.partidos p
WHERE p.estado = 'finalizado'
  AND p.ganador_id IS NOT NULL
  AND p.ranking_impact_applied = FALSE
ORDER BY p.updated_at ASC;

GRANT SELECT ON public.partidos_con_elo_pendiente TO service_role;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  7. Índice para acelerar consulta de partidos pendientes ELO  
-- ╚══════════════════════════════════════════════════════════════╝
CREATE INDEX IF NOT EXISTS idx_partidos_elo_pendiente
  ON public.partidos (ranking_impact_applied, estado)
  WHERE estado = 'finalizado' AND ranking_impact_applied = FALSE;
