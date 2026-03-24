-- migration_v38.sql
-- Agrega pending_plan_change a suscripciones + función + cron para degradar planes expirados

-- 1. Nuevo campo en suscripciones
ALTER TABLE suscripciones
  ADD COLUMN IF NOT EXISTS pending_plan_change text;

-- 2. Función que degrada planes cuyo período ya expiró
CREATE OR REPLACE FUNCTION apply_expired_plan_changes()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT s.id, s.club_id, s.pending_plan_change
    FROM suscripciones s
    WHERE s.status              = 'cancelled'
      AND s.pending_plan_change IS NOT NULL
      AND (s.next_payment_date IS NULL OR s.next_payment_date < NOW())
  LOOP
    -- Degradar el plan del club
    UPDATE clubes
       SET plan = rec.pending_plan_change
     WHERE id   = rec.club_id;

    -- Limpiar el cambio pendiente
    UPDATE suscripciones
       SET pending_plan_change = NULL
     WHERE id = rec.id;

    RAISE NOTICE 'Club % degradado a %', rec.club_id, rec.pending_plan_change;
  END LOOP;
END;
$$;

-- 3. Programar la función diariamente a las 00:05 UTC usando pg_cron
-- (pg_cron debe estar habilitado en Supabase: Dashboard → Database → Extensions → pg_cron)
DO $$
BEGIN
  -- Solo instalar si pg_cron está disponible
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'apply-expired-plan-changes',
      '5 0 * * *',
      'SELECT apply_expired_plan_changes()'
    );
  END IF;
END;
$$;
