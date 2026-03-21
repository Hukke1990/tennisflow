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
      ? 'No tienes permiso para acceder a este club. Contactá al administrador.'
      : '')
  );
  const [loading, setLoading] = useState(false);
  const loginInProgressRef = useRef(false);

  // Auto-redirect si el usuario ya está autenticado al llegar a /login.
  // Guards:
  // - loginInProgressRef: previene redirect mientras handleSubmit está corriendo
  // - !perfil || perfil.id !== user.id: espera que perfil del usuario ACTUAL cargue
  //   (evita race condition donde perfil=null o perfil es stale de otro usuario)
  useEffect(() => {
    if (authLoading || loginInProgressRef.current || !user) return;
    if (!perfil || perfil.id !== user.id) return; // Esperar perfil del usuario actual
    const rol = String(perfil?.rol || '').toLowerCase();
    if (rol !== 'super_admin' && perfil?.club_id && String(perfil.club_id) !== String(clubId)) return;
    navigate(toClubPath('/inicio'), { replace: true });
  }, [authLoading, navigate, toClubPath, user, perfil, clubId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Club aún no cargó (primera visita sin caché). No proceder.
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
          setError('No tienes permiso para acceder a este club.');
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

      // Éxito — navegar al dashboard (ClubMemberGuard verificará membresía).
      loginInProgressRef.current = false;
      navigate(toClubPath('/inicio'), { replace: true });
    } finally {
      loginInProgressRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center text-center">
      <h2 className="text-2xl font-black text-white mb-1 text-center">Iniciar Sesión</h2>
      <p className="text-gray-400 text-sm mb-8 text-center">Ingresá para acceder a tu cuenta SetGo</p>
      
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl flex items-center gap-2 justify-center text-center">
          <IconAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4 w-full flex flex-col items-center text-center">
        <div className="w-full">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider text-center w-full">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm({...form, email: e.target.value})}
            placeholder="usuario@email.com"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-center"
            required
          />
        </div>
        <div className="w-full">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider text-center w-full">Contraseña</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm({...form, password: e.target.value})}
            placeholder="••••••••"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-center"
            required
          />
        </div>
        <button
          type="submit"
            disabled={loading || clubLoading}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/30 mt-2 disabled:opacity-60 flex justify-center items-center text-center"
        >
          {loading ? 'Ingresando...' : (
            <span className="inline-flex items-center gap-1.5 justify-center text-center">
              Entrar
              <IconArrowRight className="h-4 w-4" />
            </span>
          )}
        </button>
      </form>
      
      <p className="text-center text-gray-500 text-sm mt-6 w-full">
        ¿No tenés cuenta?{' '}
        <Link to={toClubPath('/registro')} className="text-emerald-400 hover:text-emerald-300 font-semibold">
          Registrate
        </Link>
      </p>
    </div>
  );
}
