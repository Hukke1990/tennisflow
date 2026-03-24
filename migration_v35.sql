-- Migration v35: Sistema de suscripciones mensuales (Mercado Pago)
-- ──────────────────────────────────────────────────────────────────
-- Crea la tabla `suscripciones` vinculada a `clubes`.
-- Los estados siguen el ciclo de vida de un preapproval de MP:
--   pending    → generado, esperando que el titular cargue la tarjeta
--   authorized → activo y cobrando automáticamente
--   paused     → en pausa (p.ej. pago rechazado reintentando)
--   cancelled  → cancelada definitivamente
-- ──────────────────────────────────────────────────────────────────

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS public.suscripciones (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id            uuid        NOT NULL REFERENCES public.clubes(id) ON DELETE CASCADE,
  plan_id            text        NOT NULL
                                 CHECK (plan_id IN ('basico', 'pro', 'premium')),
  preapproval_id     text        UNIQUE,                     -- ID del preapproval en MP
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'authorized', 'paused', 'cancelled')),
  next_payment_date  date,                                   -- Próximo cobro (viene del webhook MP)
  payer_email        text,                                   -- Email del responsable de pago
  external_reference text,                                   -- Referencia enviada a MP (club_id)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 2. Un club solo puede tener UNA suscripción activa a la vez
--    (la creación de una nueva hace upsert sobre club_id)
CREATE UNIQUE INDEX IF NOT EXISTS suscripciones_club_id_uidx
  ON public.suscripciones (club_id);

-- 3. Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS suscripciones_preapproval_idx
  ON public.suscripciones (preapproval_id);

CREATE INDEX IF NOT EXISTS suscripciones_status_idx
  ON public.suscripciones (status);

-- 4. Trigger: mantiene updated_at al día automáticamente
CREATE OR REPLACE FUNCTION public.suscripciones_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS suscripciones_updated_at ON public.suscripciones;
CREATE TRIGGER suscripciones_updated_at
  BEFORE UPDATE ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.suscripciones_set_updated_at();

-- 5. Row Level Security
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;

-- El service_role key (backend / Edge Functions) puede hacer todo
CREATE POLICY "suscripciones_service_role"
  ON public.suscripciones
  USING (auth.role() = 'service_role');

-- Un usuario autenticado puede leer la suscripción de su propio club
CREATE POLICY "suscripciones_select_own"
  ON public.suscripciones
  FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM public.perfiles
      WHERE id = auth.uid()
    )
  );
