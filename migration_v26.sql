-- Asigna club_id en perfiles al crear usuarios desde auth.users

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  nombre_base text;
  rol_inicial text;
  telefono_base text;
  club_id_base uuid;
  club_id_text text;
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

  club_id_base := NULL;
  club_id_text := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'club_id', '')), '');

  IF club_id_text IS NOT NULL
     AND club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    club_id_base := club_id_text::uuid;
  END IF;

  BEGIN
    INSERT INTO public.perfiles (id, nombre_completo, telefono, rol, club_id)
    VALUES (NEW.id, nombre_base, telefono_base, rol_inicial, club_id_base)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN others THEN
    -- Fallback: garantizar perfil minimo aunque falle algun campo opcional.
    INSERT INTO public.perfiles (id, nombre_completo, club_id)
    VALUES (NEW.id, nombre_base, club_id_base)
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE LOG 'handle_new_user fallo para user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
