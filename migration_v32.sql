-- migration_v32.sql
-- Corrección de límites del plan Pro y adición del recurso 'jugador'
--
-- Cambios respecto a migration_v31:
--   - Pro: torneos 10 → 5, canchas 10 → 6  (valores reales del pricing)
--   - Nuevo resource_type 'jugador': basico=100, pro=500, premium=-1

-- ── Corregir límites del plan Pro ────────────────────────────────────────────
UPDATE public.plan_limits
SET max_count = 5
WHERE plan = 'pro' AND resource_type = 'torneo';

UPDATE public.plan_limits
SET max_count = 6
WHERE plan = 'pro' AND resource_type = 'cancha';

-- ── Agregar límite de jugadores activos por plan ──────────────────────────────
INSERT INTO public.plan_limits (plan, resource_type, max_count)
VALUES
  ('basico',  'jugador', 100),
  ('pro',     'jugador', 500),
  ('premium', 'jugador', -1)
ON CONFLICT (plan, resource_type)
DO UPDATE SET max_count = EXCLUDED.max_count;
