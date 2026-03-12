-- Super admin onboarding: plan comercial por club.

alter table public.clubes
  add column if not exists plan text;

update public.clubes
set plan = 'basico'
where plan is null;

alter table public.clubes
  alter column plan set default 'basico';

alter table public.clubes
  alter column plan set not null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clubes_plan_check'
  ) THEN
    ALTER TABLE public.clubes
      ADD CONSTRAINT clubes_plan_check
      CHECK (plan IN ('basico', 'pro', 'premium'));
  END IF;
END $$;
