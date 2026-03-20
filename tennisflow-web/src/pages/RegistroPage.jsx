import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { IconAlertTriangle, IconCheckCircle, IconTennisBall } from '../components/icons/UiIcons';
import { useClubPath } from '../context/ClubContext';

const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const COUNTRY_DIAL_CODES = [
  { code: 'ar', name: 'Argentina',        dial: '+54'   },
  { code: 'bo', name: 'Bolivia',           dial: '+591'  },
  { code: 'br', name: 'Brasil',            dial: '+55'   },
  { code: 'cl', name: 'Chile',             dial: '+56'   },
  { code: 'co', name: 'Colombia',          dial: '+57'   },
  { code: 'cr', name: 'Costa Rica',        dial: '+506'  },
  { code: 'cu', name: 'Cuba',              dial: '+53'   },
  { code: 'do', name: 'Rep. Dominicana',   dial: '+1809' },
  { code: 'ec', name: 'Ecuador',           dial: '+593'  },
  { code: 'sv', name: 'El Salvador',       dial: '+503'  },
  { code: 'gt', name: 'Guatemala',         dial: '+502'  },
  { code: 'hn', name: 'Honduras',          dial: '+504'  },
  { code: 'mx', name: 'México',            dial: '+52'   },
  { code: 'ni', name: 'Nicaragua',         dial: '+505'  },
  { code: 'pa', name: 'Panamá',            dial: '+507'  },
  { code: 'py', name: 'Paraguay',          dial: '+595'  },
  { code: 'pe', name: 'Perú',              dial: '+51'   },
  { code: 'pr', name: 'Puerto Rico',       dial: '+1787' },
  { code: 'uy', name: 'Uruguay',           dial: '+598'  },
  { code: 've', name: 'Venezuela',         dial: '+58'   },
  { code: 'es', name: 'España',            dial: '+34'   },
  { code: 'us', name: 'Estados Unidos',    dial: '+1'    },
  { code: 'ca', name: 'Canadá',            dial: '+1'    },
  { code: 'gb', name: 'Reino Unido',       dial: '+44'   },
  { code: 'fr', name: 'Francia',           dial: '+33'   },
  { code: 'de', name: 'Alemania',          dial: '+49'   },
  { code: 'it', name: 'Italia',            dial: '+39'   },
  { code: 'pt', name: 'Portugal',          dial: '+351'  },
  { code: 'au', name: 'Australia',         dial: '+61'   },
  { code: 'il', name: 'Israel',            dial: '+972'  },
];

const flagUrl = (code) => `https://flagcdn.com/24x18/${code}.png`;

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
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', password: '', confirmar: '' });
  const [dialCountry, setDialCountry] = useState(COUNTRY_DIAL_CODES[0]); // Argentina por defecto
  const [localNumber, setLocalNumber] = useState('');
  const [dialOpen, setDialOpen] = useState(false);
  const [dialSearch, setDialSearch] = useState('');
  const dialRef = useRef(null);
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

  // Cerrar dropdown de país al hacer click fuera
  useEffect(() => {
    if (!dialOpen) return;
    const handleOutsideClick = (e) => {
      if (dialRef.current && !dialRef.current.contains(e.target)) {
        setDialOpen(false);
        setDialSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [dialOpen]);

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

    const digits = localNumber.replace(/\D/g, '');
    const telefonoNormalizado = `${dialCountry.dial}${digits}`;
    if (!INTERNATIONAL_PHONE_REGEX.test(telefonoNormalizado)) {
      return setError('Ingresa un número de teléfono válido (mínimo 7 dígitos sin el prefijo de país).');
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
      <p className="text-gray-400 text-sm mb-8">Únete a SetGo y participá en torneos</p>

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
              <div className="flex gap-2">
                {/* Selector de prefijo de país */}
                <div ref={dialRef} className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setDialOpen((o) => !o); setDialSearch(''); }}
                    className="h-12 flex items-center gap-1.5 px-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <img
                      src={flagUrl(dialCountry.code)}
                      alt={dialCountry.name}
                      className="w-6 h-auto rounded-sm object-cover"
                    />
                    <span className="font-mono text-emerald-300">{dialCountry.dial}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-gray-400 transition-transform ${dialOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {dialOpen && (
                    <div className="absolute z-50 top-full mt-1 left-0 w-64 rounded-xl bg-[#0d1b35] border border-white/10 shadow-2xl shadow-black/60 overflow-hidden">
                      {/* Buscador */}
                      <div className="p-2 border-b border-white/10">
                        <input
                          type="text"
                          autoFocus
                          value={dialSearch}
                          onChange={(e) => setDialSearch(e.target.value)}
                          placeholder="Buscar país..."
                          className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      {/* Lista de países */}
                      <ul className="max-h-48 overflow-y-auto py-1">
                        {COUNTRY_DIAL_CODES
                          .filter((c) => {
                            const q = dialSearch.trim().toLowerCase();
                            return !q || c.name.toLowerCase().includes(q) || c.dial.includes(q);
                          })
                          .map((c) => (
                            <li key={`${c.dial}-${c.name}`}>
                              <button
                                type="button"
                                onClick={() => { setDialCountry(c); setDialOpen(false); setDialSearch(''); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors ${
                                  c.name === dialCountry.name ? 'text-emerald-300 bg-emerald-500/10' : 'text-white'
                                }`}
                              >
                                <img
                                  src={flagUrl(c.code)}
                                  alt={c.name}
                                  className="w-6 h-auto rounded-sm object-cover flex-shrink-0"
                                />
                                <span className="flex-1 truncate">{c.name}</span>
                                <span className="font-mono text-gray-400 text-xs">{c.dial}</span>
                              </button>
                            </li>
                          ))
                        }
                      </ul>
                    </div>
                  )}
                </div>

                {/* Campo de número local */}
                <input
                  type="tel"
                  value={localNumber}
                  onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="1122334455"
                  required
                  inputMode="numeric"
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">Solo dígitos, sin el 0 o el 15 inicial. Ej: para Argentina 11 2233 4455 → <span className="text-gray-400">1122334455</span></p>
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
