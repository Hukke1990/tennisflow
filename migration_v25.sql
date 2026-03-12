-- Multitenant inicial: clubes + club_id en tablas core

create table if not exists public.clubes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null,
  logo_url text,
  config_visual jsonb not null default '{}'::jsonb
);

create unique index if not exists clubes_slug_unique_idx on public.clubes (slug);

alter table public.perfiles add column if not exists club_id uuid;
alter table public.torneos add column if not exists club_id uuid;
alter table public.canchas add column if not exists club_id uuid;
alter table public.inscripciones add column if not exists club_id uuid;

DO $$
DECLARE
  v_club_id uuid;
BEGIN
  insert into public.clubes (nombre, slug, logo_url, config_visual)
  values ('TennisFlow Demo', 'demo', null, '{}'::jsonb)
  on conflict (slug) do update
    set nombre = excluded.nombre,
        logo_url = coalesce(public.clubes.logo_url, excluded.logo_url),
        config_visual = coalesce(public.clubes.config_visual, excluded.config_visual)
  returning id into v_club_id;

  update public.perfiles set club_id = v_club_id where club_id is null;
  update public.torneos set club_id = v_club_id where club_id is null;
  update public.canchas set club_id = v_club_id where club_id is null;
  update public.inscripciones set club_id = v_club_id where club_id is null;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'perfiles_club_id_fkey'
  ) THEN
    ALTER TABLE public.perfiles
      ADD CONSTRAINT perfiles_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES public.clubes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'torneos_club_id_fkey'
  ) THEN
    ALTER TABLE public.torneos
      ADD CONSTRAINT torneos_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES public.clubes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'canchas_club_id_fkey'
  ) THEN
    ALTER TABLE public.canchas
      ADD CONSTRAINT canchas_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES public.clubes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inscripciones_club_id_fkey'
  ) THEN
    ALTER TABLE public.inscripciones
      ADD CONSTRAINT inscripciones_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES public.clubes(id) ON DELETE RESTRICT;
  END IF;
END $$;

create index if not exists idx_perfiles_club_id on public.perfiles (club_id);
create index if not exists idx_torneos_club_id on public.torneos (club_id);
create index if not exists idx_canchas_club_id on public.canchas (club_id);
create index if not exists idx_inscripciones_club_id on public.inscripciones (club_id);
