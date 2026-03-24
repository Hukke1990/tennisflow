-- migration_v34: plan_type column + RPC check_tournament_overlap
-- ─────────────────────────────────────────────────────────────────
-- 1. Columna plan_type en clubes
--    La columna 'plan' existente usa 'basico'/'pro'/'premium'.
--    plan_type usa los valores en inglés: 'basic'/'pro'/'premium'.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.clubes
  ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'basic';

-- Poblar plan_type desde plan (una sola vez)
UPDATE public.clubes
SET plan_type = CASE plan
  WHEN 'basico'  THEN 'basic'
  WHEN 'pro'     THEN 'pro'
  WHEN 'premium' THEN 'premium'
  ELSE 'basic'
END
WHERE plan_type IS NULL OR plan_type = 'basic';

-- Restricción de valores permitidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clubes_plan_type_check'
  ) THEN
    ALTER TABLE public.clubes
      ADD CONSTRAINT clubes_plan_type_check
        CHECK (plan_type IN ('basic', 'pro', 'premium'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. RPC check_tournament_overlap
--    Devuelve la cantidad de torneos del club cuyas fechas se solapan
--    con el rango [p_start_date, p_end_date], excluyendo torneos
--    cancelados o finalizados.
--
--    Uso desde el backend:
--      supabase.rpc('check_tournament_overlap', {
--        p_club_id:    '...uuid...',
--        p_start_date: '2025-09-06T00:00:00Z',
--        p_end_date:   '2025-09-07T23:59:59Z',
--      })
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_tournament_overlap(
  p_club_id    uuid,
  p_start_date timestamptz,
  p_end_date   timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM public.torneos
  WHERE club_id = p_club_id
    AND estado NOT IN ('cancelado', 'finalizado')
    AND fecha_inicio <= p_end_date
    AND fecha_fin    >= p_start_date;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.check_tournament_overlap(uuid, timestamptz, timestamptz)
  TO authenticated, anon, service_role;
