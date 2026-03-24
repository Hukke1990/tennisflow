-- migration_v31: plan_limits — topes de recursos por tier de suscripción
-- La columna `plan` ya existe en `clubes` (migration_v27).
-- Convención: max_count = -1 → ilimitado.

create table if not exists public.plan_limits (
  plan          text    not null,
  resource_type text    not null,   -- 'torneo' | 'cancha'
  max_count     integer not null,   -- -1 = ilimitado
  created_at    timestamptz not null default now(),
  primary key (plan, resource_type),
  constraint plan_limits_plan_check
    check (plan in ('basico','pro','premium')),
  constraint plan_limits_resource_check
    check (resource_type in ('torneo','cancha')),
  constraint plan_limits_max_count_check
    check (max_count >= -1)
);

-- Habilitar RLS (solo lectura pública; escritura solo via service_role)
alter table public.plan_limits enable row level security;

create policy "plan_limits_public_read"
  on public.plan_limits for select
  using (true);

-- Valores por defecto
insert into public.plan_limits (plan, resource_type, max_count) values
  ('basico',  'torneo', 2),
  ('basico',  'cancha', 2),
  ('pro',     'torneo', 10),
  ('pro',     'cancha', 10),
  ('premium', 'torneo', -1),
  ('premium', 'cancha', -1)
on conflict (plan, resource_type) do update
  set max_count = excluded.max_count;
