-- migration_v20.sql
-- Fix de registro: trigger de alta de perfil compatible con schema actual
-- (rol por enum) y con columnas legacy opcionales.

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
  has_ranking_elo boolean := false;
  has_es_admin boolean := false;
  has_rol boolean := false;
  rol_is_enum boolean := false;
  nombre_base text;
  rol_inicial text;
  insert_columns text := 'id, nombre_completo';
  insert_values text := '$1, $2';
  insert_sql text;
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

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'perfiles'
      AND column_name = 'ranking_elo'
  ) INTO has_ranking_elo;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'perfiles'
      AND column_name = 'es_admin'
  ) INTO has_es_admin;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'perfiles'
      AND column_name = 'rol'
  ) INTO has_rol;

  IF has_rol THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'perfiles'
        AND column_name = 'rol'
        AND udt_schema = 'public'
        AND udt_name = 'rol_usuario'
    ) INTO rol_is_enum;
  END IF;

  IF has_ranking_elo THEN
    insert_columns := insert_columns || ', ranking_elo';
    insert_values := insert_values || ', 1200';
  END IF;

  IF has_es_admin THEN
    insert_columns := insert_columns || ', es_admin';
    insert_values := insert_values || ', false';
  END IF;

  IF has_rol THEN
    insert_columns := insert_columns || ', rol';
    IF rol_is_enum THEN
      insert_values := insert_values || ', $3::public.rol_usuario';
    ELSE
      insert_values := insert_values || ', $3';
    END IF;
  END IF;

  insert_sql := format(
    'INSERT INTO public.perfiles (%s) VALUES (%s) ON CONFLICT (id) DO NOTHING',
    insert_columns,
    insert_values
  );

  BEGIN
    IF has_rol THEN
      EXECUTE insert_sql USING NEW.id, nombre_base, rol_inicial;
    ELSE
      EXECUTE insert_sql USING NEW.id, nombre_base;
    END IF;
  EXCEPTION WHEN others THEN
    -- Fallback: garantizar perfil minimo aunque falle un campo opcional.
    INSERT INTO public.perfiles (id, nombre_completo)
    VALUES (NEW.id, nombre_base)
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Evita bloquear el signup por drift de esquema en perfiles.
  RAISE LOG 'handle_new_user fallo para user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ language plpgsql security definer set search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
