-- Migration v37: log_pagos (auditoría de webhooks MP) + Supabase Realtime en clubes
-- ────────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabla log_pagos ────────────────────────────────────────────────────────
-- Registra CADA notificación recibida del webhook de Mercado Pago
-- (tanto preapprovals como pagos individuales) para auditoría completa.
CREATE TABLE IF NOT EXISTS public.log_pagos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             uuid        REFERENCES public.clubes(id) ON DELETE SET NULL,

  -- Identificadores MP
  mp_resource_id      text        NOT NULL,        -- ID del recurso (preapproval_id o payment_id)
  mp_topic            text        NOT NULL,        -- 'subscription_preapproval' | 'payment' | 'preapproval'
  mp_status           text,                        -- Estado reportado por MP
  mp_raw_status       text,                        -- Estado crudo tal como lo devuelve MP (sin normalizar)

  -- Resultado del procesamiento
  action_taken        text,                        -- 'plan_upgraded' | 'plan_downgraded' | 'no_action' | 'error'
  plan_anterior       text,                        -- Plan antes del cambio (si aplica)
  plan_nuevo          text,                        -- Plan después del cambio (si aplica)

  -- Datos del pago (si el topic es 'payment')
  monto               numeric(10,2),
  currency            text,

  -- Payload crudo recibido (para debug)
  raw_body            jsonb,

  -- Metadatos
  ip_address          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS log_pagos_club_idx
  ON public.log_pagos (club_id);

CREATE INDEX IF NOT EXISTS log_pagos_mp_resource_idx
  ON public.log_pagos (mp_resource_id);

CREATE INDEX IF NOT EXISTS log_pagos_created_idx
  ON public.log_pagos (created_at DESC);

-- RLS: service_role puede todo; admins del club pueden leer sus propios registros
ALTER TABLE public.log_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "log_pagos_service_role"
  ON public.log_pagos
  USING (auth.role() = 'service_role');

CREATE POLICY "log_pagos_select_own"
  ON public.log_pagos
  FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM public.perfiles
      WHERE id = auth.uid()
    )
  );

-- ── 2. Habilitar Supabase Realtime en la tabla clubes ────────────────────────
-- Ejecutar también en el Supabase Dashboard:
--   Database → Replication → Tables → clubes → Toggle ON
--
-- Este ALTER garantiza que los cambios (UPDATE) disparen eventos al canal
-- de Realtime cuando se modifica la columna `plan`.
ALTER PUBLICATION supabase_realtime ADD TABLE public.clubes;
