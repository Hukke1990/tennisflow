import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { IconAlertTriangle, IconArrowRight } from '../components/icons/UiIcons';
import { useClubPath } from '../context/ClubContext';
import { useClub } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toClubPath = useClubPath();
  const { clubId, loading: clubLoading } = useClub();
  const { user, perfil, loading: authLoading, signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(
    location.state?.error ||
    (searchParams.get('error') === 'unauthorized'
      ? 'No tenés permiso para acceder a este club. Contactá al administrador.'
      : '')
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const loginInProgressRef = useRef(false);

  // Auto-redirect si el usuario ya está autenticado al llegar a /login.
  // Guards:
  // - loginInProgressRef: previene redirect mientras handleSubmit está corriendo
  // - !perfil || perfil.id !== user.id: espera que perfil del usuario ACTUAL cargue
  useEffect(() => {
    if (authLoading || loginInProgressRef.current || !user) return;
    if (!perfil || perfil.id !== user.id) return;
    const rol = String(perfil?.rol || '').toLowerCase();
    if (rol !== 'super_admin' && perfil?.club_id && String(perfil.club_id) !== String(clubId)) return;
    navigate(toClubPath('/inicio'), { replace: true });
  }, [authLoading, navigate, toClubPath, user, perfil, clubId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!clubId) {
      setError('Espera un momento, cargando datos del club...');
      return;
    }

    setLoading(true);
    loginInProgressRef.current = true;

    try {
      const { error: signInError } = await signIn(form.email, form.password, clubId);

      if (signInError) {
        if (signInError.message === 'WRONG_CLUB') {
          setError('No tenés permiso para acceder a este club.');
          return;
        }
        if (signInError.message?.includes('Invalid login credentials')) {
          setError('Email o contraseña incorrectos. Verificá tus datos.');
          return;
        }
        if (signInError.message?.includes('Email not confirmed')) {
          setError('Debés confirmar tu email antes de ingresar. Revisá tu bandeja de entrada.');
          return;
        }
        setError(signInError.message || 'Ocurrió un error al iniciar sesión.');
        return;
      }

      loginInProgressRef.current = false;
      navigate(toClubPath('/inicio'), { replace: true });
    } finally {
      loginInProgressRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-black text-white mb-1">Iniciar Sesión</h2>
      <p className="text-slate-400 text-sm mb-6">Ingresá para acceder a tu cuenta SetGo</p>

      {error && (
        <div className="mb-5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5">
          <IconAlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <span className="text-red-300 text-sm leading-snug">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            placeholder="usuario@email.com"
            className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all"
            required
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Contraseña</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || clubLoading}
          className="w-full py-3 rounded-xl font-bold text-sm text-[#040e1c] mt-2 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{ background: loading || clubLoading ? '#6b8c2a' : '#A6CE39', boxShadow: '0 4px 24px rgba(166,206,57,0.25)' }}
        >
          {loading ? (
            <><div className="h-4 w-4 rounded-full border-2 border-[#040e1c]/40 border-t-[#040e1c] animate-spin" />Ingresando...</>
          ) : (
            <>Entrar <IconArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>

      <p className="text-slate-500 text-sm mt-6">
        ¿No tenés cuenta?{' '}
        <Link to={toClubPath('/registro')} className="font-semibold hover:text-white transition-colors" style={{ color: '#A6CE39' }}>
          Registrate
        </Link>
      </p>
    </div>
  );
}