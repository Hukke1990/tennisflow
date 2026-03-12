-- migration_v23.sql
-- Agrega telefono al perfil y lo guarda automaticamente en el signup.

ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS telefono TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'rol_usuario'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.rol_usuario AS ENUM ('jugador', 'admin', 'super_admin');
  END IF;
END;
$$;

ALTER TABLE IF EXISTS public.perfiles
  ADD COLUMN IF NOT EXISTS rol public.rol_usuario DEFAULT 'jugador';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  nombre_base text;
  rol_inicial text;
  telefono_base text;
BEGIN
  nombre_base := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'nombre_completo'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'Jugador'
  );

  rol_inicial := lower(trim(COALESCE(NEW.raw_user_meta_data->>'rol', 'jugador')));
  IF rol_inicial = 'superadmin' THEN
    rol_inicial := 'super_admin';
  END IF;
  IF rol_inicial NOT IN ('jugador', 'admin', 'super_admin') THEN
    rol_inicial := 'jugador';
  END IF;

  telefono_base := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'telefono', '')), '');

  BEGIN
    INSERT INTO public.perfiles (id, nombre_completo, telefono, rol)
    VALUES (NEW.id, nombre_base, telefono_base, rol_inicial)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN others THEN
    -- Fallback: garantizar perfil minimo aunque falle algun campo opcional.
    INSERT INTO public.perfiles (id, nombre_completo)
    VALUES (NEW.id, nombre_base)
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE LOG 'handle_new_user fallo para user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ language plpgsql security definer set search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
