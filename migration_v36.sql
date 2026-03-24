-- Migration v36: Historial de pagos de suscripciones
-- ──────────────────────────────────────────────────────────────────
-- Registra cada cobro individual que Mercado Pago realiza sobre una
-- suscripción. El campo `currency` es OBLIGATORIO para tener reportes
-- sin ambigüedad de moneda (ej: USD, ARS, BRL, etc.).
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pagos_historial (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid        NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  suscripcion_id   uuid        REFERENCES public.suscripciones(id) ON DELETE SET NULL,

  -- Identificadores de Mercado Pago
  preapproval_id   text,                    -- ID del preapproval al que pertenece el cobro
  payment_id       text        UNIQUE,      -- ID del pago individual en MP (idempotencia)

  -- Datos del cobro
  monto            numeric(10,2) NOT NULL,
  currency         text        NOT NULL     -- Moneda ISO 4217 (ej: 'USD', 'ARS', 'BRL')
                               CHECK (currency ~ '^[A-Z]{3}$'),
  plan_id          text        NOT NULL
                               CHECK (plan_id IN ('basico', 'pro', 'premium')),
  status           text        NOT NULL
                               CHECK (status IN ('approved', 'pending', 'rejected', 'refunded')),

  fecha_pago       timestamptz,             -- Momento en que MP confirma el cobro
  descripcion      text,                    -- reason del preapproval (nombre del plan)
  payer_email      text,                    -- Email del pagador al momento del cobro

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS pagos_historial_club_idx
  ON public.pagos_historial (club_id);

CREATE INDEX IF NOT EXISTS pagos_historial_suscripcion_idx
  ON public.pagos_historial (suscripcion_id);

CREATE INDEX IF NOT EXISTS pagos_historial_status_idx
  ON public.pagos_historial (club_id, status);

CREATE INDEX IF NOT EXISTS pagos_historial_fecha_idx
  ON public.pagos_historial (fecha_pago DESC);

-- Row Level Security
ALTER TABLE public.pagos_historial ENABLE ROW LEVEL SECURITY;

-- Service role puede hacer todo (backend y Edge Functions)
CREATE POLICY "pagos_historial_service_role"
  ON public.pagos_historial
  USING (auth.role() = 'service_role');

-- Un usuario autenticado puede ver el historial de su propio club
CREATE POLICY "pagos_historial_select_own"
  ON public.pagos_historial
  FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM public.perfiles
      WHERE id = auth.uid()
    )
  );
