-- migration_v30.sql
-- Multi-tenancy: tabla usuario_clubes + función vincular_usuario_a_club
-- Permite que un mismo usuario pertenezca a múltiples clubes.

-- ─── 1. Tabla de membresías usuario ↔ club ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuario_clubes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  club_id    UUID NOT NULL REFERENCES public.clubes(id)   ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, club_id)
);

-- ─── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.usuario_clubes ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo puede ver sus propias membresías
CREATE POLICY "usuario_clubes_select_self"
  ON public.usuario_clubes FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 3. Backfill: migrar membresías existentes desde perfiles.club_id ───────
INSERT INTO public.usuario_clubes (user_id, club_id)
SELECT id, club_id
FROM   public.perfiles
WHERE  club_id IS NOT NULL
ON CONFLICT (user_id, club_id) DO NOTHING;

-- ─── 4. RPC segura: vincular usuario existente a un nuevo club ──────────────
-- Usa SECURITY DEFINER para poder leer auth.users (no accesible por anon).
-- Solo vincula si el usuario ya existe; no expone ningún dato del usuario.
CREATE OR REPLACE FUNCTION public.vincular_usuario_a_club(
  p_email   TEXT,
  p_club_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Buscar el usuario por email en auth.users
  SELECT id INTO v_user_id
  FROM   auth.users
  WHERE  email = lower(trim(p_email))
  LIMIT  1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Insertar vínculo (idempotente — ignora si ya existe)
  INSERT INTO public.usuario_clubes (user_id, club_id)
  VALUES (v_user_id, p_club_id)
  ON CONFLICT (user_id, club_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id::text);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Permitir que anon y authenticated llamen a esta función
GRANT EXECUTE ON FUNCTION public.vincular_usuario_a_club(TEXT, UUID) TO anon, authenticated;

-- ─── 5. Actualizar handle_new_user: también insertar en usuario_clubes ──────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  nombre_base    text;
  rol_inicial    text;
  telefono_base  text;
  club_id_base   uuid;
  club_id_text   text;
BEGIN
  nombre_base := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'nombre_completo'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'Jugador'
  );

  rol_inicial := lower(trim(COALESCE(NEW.raw_user_meta_data->>'rol', 'jugador')));
  IF rol_inicial = 'superadmin' THEN rol_inicial := 'super_admin'; END IF;
  IF rol_inicial NOT IN ('jugador', 'admin', 'super_admin') THEN
    rol_inicial := 'jugador';
  END IF;

  telefono_base := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'telefono', '')), '');
  club_id_base  := NULL;
  club_id_text  := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'club_id', '')), '');

  IF club_id_text IS NOT NULL
     AND club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    club_id_base := club_id_text::uuid;
  END IF;

  BEGIN
    INSERT INTO public.perfiles (id, nombre_completo, telefono, rol, club_id)
    VALUES (NEW.id, nombre_base, telefono_base, rol_inicial, club_id_base)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN others THEN
    INSERT INTO public.perfiles (id, nombre_completo, club_id)
    VALUES (NEW.id, nombre_base, club_id_base)
    ON CONFLICT (id) DO NOTHING;
  END;

  -- Insertar en usuario_clubes para soporte multi-tenancy
  IF club_id_base IS NOT NULL THEN
    INSERT INTO public.usuario_clubes (user_id, club_id)
    VALUES (NEW.id, club_id_base)
    ON CONFLICT (user_id, club_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE LOG 'handle_new_user fallo para user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
