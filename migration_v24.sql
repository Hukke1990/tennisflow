-- migration_v24.sql
-- Configuracion global para plantilla de WhatsApp en gestion de inscripciones.

CREATE TABLE IF NOT EXISTS public.configuracion_admin (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descripcion TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_updated_at_configuracion_admin()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_configuracion_admin_updated_at ON public.configuracion_admin;
CREATE TRIGGER trg_configuracion_admin_updated_at
BEFORE UPDATE ON public.configuracion_admin
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_configuracion_admin();

INSERT INTO public.configuracion_admin (clave, valor, descripcion)
VALUES (
  'inscripciones_whatsapp_template',
  'Hola {jugador}, te contacto por tu solicitud de inscripcion al {torneo}.',
  'Plantilla de mensaje de WhatsApp para gestion de inscripciones.'
)
ON CONFLICT (clave) DO NOTHING;
