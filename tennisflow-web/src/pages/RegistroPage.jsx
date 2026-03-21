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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
        // Redirigir al frontend (no al backend) luego de confirmar el email.
        // window.location.origin apunta al dominio del frontend en cualquier
        // entorno (localhost:5173 en dev, dominio de producción en prod).
        emailRedirectTo: `${window.location.origin}/${clubSlugResolved}/inicio`,
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
    <div className="w-full">
      <h2 className="text-xl font-black text-white mb-1">Crear Cuenta</h2>
      <p className="text-slate-400 text-sm mb-6">Únete a SetGo y participá en torneos</p>

      {clubLoading ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-2.5">
          <div className="w-4 h-4 border-2 border-[#A6CE39]/40 border-t-[#A6CE39] rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-slate-400">Resolviendo club invitante...</span>
        </div>
      ) : (
        <div className="mb-6 rounded-2xl border border-[#A6CE39]/20 bg-[#A6CE39]/[0.06] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2.5" style={{ color: 'rgba(166,206,57,0.7)' }}>Invitación</p>
          <div className="flex items-center gap-3">
            {clubInvitante?.logo_url ? (
              <img
                src={clubInvitante.logo_url}
                alt={`Logo ${clubInvitante.nombre}`}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-[#A6CE39]/30"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#A6CE39]/20 font-black text-xs flex items-center justify-center ring-2 ring-[#A6CE39]/20" style={{ color: '#A6CE39' }}>
                {clubInitials}
              </div>
            )}
            <p className="text-sm text-white/80">
              Registrándote en <span className="font-black text-white">{clubInvitante?.nombre}</span>
            </p>
          </div>
        </div>
      )}

      {!clubLoading && (
        <>
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5">
              <IconAlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-red-300 text-sm leading-snug">{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-5 p-3.5 rounded-2xl bg-[#A6CE39]/10 border border-[#A6CE39]/25 flex items-start gap-2.5">
              <IconCheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#A6CE39' }} />
              <span className="text-sm leading-snug" style={{ color: 'rgba(166,206,57,0.9)' }}>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Nombre</label>
                <input type="text" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
                  placeholder="Roger" required
                  className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Apellido</label>
                <input type="text" value={form.apellido} onChange={e => setForm({...form, apellido: e.target.value})}
                  placeholder="Federer" required
                  className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Teléfono / WhatsApp</label>
              <div className="flex gap-2">
                <div ref={dialRef} className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setDialOpen((o) => !o); setDialSearch(''); }}
                    className="h-[46px] flex items-center gap-1.5 px-3 bg-white/[0.05] border border-white/10 rounded-xl text-white text-sm hover:bg-white/10 transition-colors focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15"
                  >
                    <img src={flagUrl(dialCountry.code)} alt={dialCountry.name} className="w-6 h-auto rounded-sm object-cover" />
                    <span className="font-mono text-[0.8rem]" style={{ color: '#A6CE39' }}>{dialCountry.dial}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-500 transition-transform ${dialOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {dialOpen && (
                    <div className="absolute z-50 top-full mt-1 left-0 w-64 rounded-2xl bg-[#0a1628] border border-white/10 shadow-2xl shadow-black/70 overflow-hidden">
                      <div className="p-2 border-b border-white/10">
                        <input
                          type="text"
                          autoFocus
                          value={dialSearch}
                          onChange={(e) => setDialSearch(e.target.value)}
                          placeholder="Buscar país..."
                          className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#A6CE39]/40"
                        />
                      </div>
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
                                  c.name === dialCountry.name ? 'bg-[#A6CE39]/10' : ''
                                }`}
                                style={c.name === dialCountry.name ? { color: '#A6CE39' } : { color: 'white' }}
                              >
                                <img src={flagUrl(c.code)} alt={c.name} className="w-6 h-auto rounded-sm object-cover flex-shrink-0" />
                                <span className="flex-1 truncate">{c.name}</span>
                                <span className="font-mono text-slate-400 text-xs">{c.dial}</span>
                              </button>
                            </li>
                          ))
                        }
                      </ul>
                    </div>
                  )}
                </div>

                <input
                  type="tel"
                  value={localNumber}
                  onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="1122334455"
                  required
                  inputMode="numeric"
                  className="flex-1 min-w-0 bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-600">Sin el 0 o el 15 inicial. Ej: Argentina 11 2233 4455 → <span className="text-slate-500">1122334455</span></p>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                placeholder="usuario@email.com" required
                className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({...form, password: e.target.value})}
                    placeholder="••••••••"
                    required
                    className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Confirmar</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={form.confirmar}
                    onChange={e => setForm({...form, confirmar: e.target.value})}
                    placeholder="••••••••"
                    required
                    className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showConfirm ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm text-[#040e1c] mt-2 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{ background: loading ? '#6b8c2a' : '#A6CE39', boxShadow: '0 4px 24px rgba(166,206,57,0.25)' }}
            >
              {loading ? (
                <><div className="h-4 w-4 rounded-full border-2 border-[#040e1c]/40 border-t-[#040e1c] animate-spin" />Creando cuenta...</>
              ) : (
                <>Crear Cuenta <IconTennisBall className="h-4 w-4" /></>
              )}
            </button>
          </form>

          <p className="text-slate-500 text-sm mt-6">
            ¿Ya tenés cuenta?{' '}
            <Link to={toClubPath('/login')} className="font-semibold hover:text-white transition-colors" style={{ color: '#A6CE39' }}>
              Iniciá sesión
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
