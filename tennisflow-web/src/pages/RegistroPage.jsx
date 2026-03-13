import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { IconAlertTriangle, IconCheckCircle, IconTennisBall } from '../components/icons/UiIcons';
import { useClubPath } from '../context/ClubContext';

const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const normalizePhoneInput = (rawValue = '') => {
  const text = String(rawValue || '');
  let result = '';

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '+' && result.length === 0) {
      result += char;
      continue;
    }

    if (char >= '0' && char <= '9') {
      result += char;
    }
  }

  return result;
};

const toSignupErrorMessage = (rawMessage = '') => {
  const normalized = String(rawMessage || '').toLowerCase();

  if (normalized.includes('already registered')) {
    return 'Ese email ya esta registrado. Queres iniciar sesion?';
  }

  if (
    normalized.includes('database error saving new user')
    || normalized.includes('failed to create user')
    || normalized.includes('status 500')
  ) {
    return 'No se pudo completar el registro por una validacion interna de base de datos. Aplica migration_v23.sql en Supabase para actualizar perfiles/telefono y vuelve a intentar.';
  }

  return rawMessage || 'No se pudo completar el registro. Intenta nuevamente.';
};

export default function RegistroPage() {
  const navigate = useNavigate();
  const { clubSlug } = useParams();
  const toClubPath = useClubPath();
  const [clubInvitante, setClubInvitante] = useState(null);
  const [clubLoading, setClubLoading] = useState(true);
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', email: '', password: '', confirmar: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const loadClubBySlug = async () => {
      const slug = String(clubSlug || '').trim();
      if (!slug) {
        navigate('/club-no-encontrado', { replace: true });
        return;
      }

      setClubLoading(true);

      const { data, error: clubError } = await supabase
        .from('clubes')
        .select('id, nombre, slug, logo_url')
        .eq('slug', slug)
        .maybeSingle();

      if (!active) return;

      if (clubError || !data) {
        navigate('/club-no-encontrado', {
          replace: true,
          state: { clubSlug: slug },
        });
        return;
      }

      setClubInvitante(data);
      setClubLoading(false);
    };

    loadClubBySlug();

    return () => {
      active = false;
    };
  }, [clubSlug, navigate]);

  const clubId = clubInvitante?.id || null;
  const clubSlugResolved = clubInvitante?.slug || String(clubSlug || '').trim();
  const clubInitials = useMemo(() => {
    const text = String(clubInvitante?.nombre || '').trim();
    if (!text) return 'TF';

    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((piece) => piece[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [clubInvitante?.nombre]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.password !== form.confirmar) {
      return setError('Las contraseñas no coinciden.');
    }
    if (form.password.length < 6) {
      return setError('La contraseña debe tener al menos 6 caracteres.');
    }

    const telefonoNormalizado = normalizePhoneInput(form.telefono);
    if (!INTERNATIONAL_PHONE_REGEX.test(telefonoNormalizado)) {
      return setError('Ingresa un teléfono en formato internacional. Ejemplo: +5491122334455');
    }

    if (!clubId) {
      return setError('No se pudo resolver el club actual. Recarga la pagina e intenta nuevamente.');
    }

    setLoading(true);

    const nombreCompleto = `${form.nombre.trim()} ${form.apellido.trim()}`.trim();

    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          nombre_completo: nombreCompleto,
          telefono: telefonoNormalizado,
          club_id: clubId,
          club_slug: clubSlugResolved,
        }
      }
    });

    setLoading(false);

    if (authError) {
      setError(toSignupErrorMessage(authError.message));
      return;
    }

    // Si Supabase no requiere confirmación por email, el usuario ya tiene sesión
    if (data.session) {
      navigate(toClubPath('/torneos'), { replace: true });
    } else {
      // Si requiere confirmación de email
      setSuccess('Registro exitoso. Revisa tu email para confirmar tu cuenta antes de ingresar.');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-black text-white mb-1">Crear Cuenta</h2>
      <p className="text-gray-400 text-sm mb-8">Únete a TennisFlow y participá en torneos</p>

      {clubLoading ? (
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300 inline-flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          Resolviendo club invitante...
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">Invitación</p>
          <div className="inline-flex items-center gap-3">
            {clubInvitante?.logo_url ? (
              <img
                src={clubInvitante.logo_url}
                alt={`Logo ${clubInvitante.nombre}`}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-300/40"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white font-black text-xs inline-flex items-center justify-center ring-2 ring-emerald-300/40">
                {clubInitials}
              </div>
            )}
            <p className="text-sm text-emerald-100">
              Estás registrándote en <span className="font-black">{clubInvitante?.nombre}</span>
            </p>
          </div>
        </div>
      )}

      {!clubLoading && (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl inline-flex items-start gap-2">
              <IconAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-xl inline-flex items-start gap-2">
              <IconCheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Nombre</label>
                <input type="text" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                  placeholder="Roger" required
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Apellido</label>
                <input type="text" value={form.apellido} onChange={e => setForm({...form, apellido: e.target.value})}
                  placeholder="Federer" required
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Teléfono / WhatsApp</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={e => setForm({ ...form, telefono: normalizePhoneInput(e.target.value) })}
                placeholder="+5491122334455"
                required
                inputMode="tel"
                pattern="^\+[1-9]\d{7,14}$"
                title="Usa formato internacional con + y solo numeros. Ej: +5491122334455"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
              <p className="mt-1.5 text-[11px] text-gray-500">Formato requerido: +codigo_pais + numero (solo digitos). Ejemplo: +5491122334455</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                placeholder="usuario@email.com" required
                className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Contraseña</label>
                <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                  placeholder="••••••••" required
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Confirmar</label>
                <input type="password" value={form.confirmar} onChange={e => setForm({...form, confirmar: e.target.value})}
                  placeholder="••••••••" required
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/30 mt-2 disabled:opacity-60">
              {loading ? 'Creando cuenta...' : (
                <span className="inline-flex items-center gap-1.5">
                  Crear Cuenta
                  <IconTennisBall className="h-4 w-4" />
                </span>
              )}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            ¿Ya tenés cuenta?{' '}
            <Link to={toClubPath('/login')} className="text-emerald-400 hover:text-emerald-300 font-semibold">Iniciá sesión</Link>
          </p>
        </>
      )}
    </div>
  );
}
